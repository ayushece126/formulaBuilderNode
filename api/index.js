// api/index.js
import express from "express";
import dotenv from "dotenv";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const app = express();
dotenv.config();
const sessions = new Map();
const supportedFunctions = [
  "AND",
  "OR",
  "NOT",
  "XOR",
  "IF",
  "CASE",
  "LEN",
  "SUBSTRING",
  "LEFT",
  "RIGHT",
  "ISBLANK",
  "ISPICKVAL",
  "CONVERTID",
  "ABS",
  "ROUND",
  "CEILING",
  "FLOOR",
  "SQRT",
  "ACOS",
  "ASIN",
  "ATAN",
  "COS",
  "SIN",
  "TAN",
  "COSH",
  "SINH",
  "TANH",
  "EXP",
  "LOG",
  "LOG10",
  "RINT",
  "SIGNUM",
  "INTEGER",
  "POW",
  "MAX",
  "MIN",
  "MOD",
  "TEXT",
  "DATETIME",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "DAY",
  "MONTH",
  "YEAR",
  "HOURS",
  "MINUTES",
  "SECONDS",
  "ADDDAYS",
  "ADDMONTHS",
  "ADDYEARS",
  "ADDHOURS",
  "ADDMINUTES",
  "ADDSECONDS",
  "CONTAINS",
  "FIND",
  "LOWER",
  "UPPER",
  "MID",
  "SUBSTITUTE",
  "TRIM",
  "VALUE",
  "CONCATENATE",
  "TODAY=>$TODAY",
  "WEEKDAY",
  "BEGINS",
];

const supportedOperators = [
  "+",
  "-",
  "/",
  "*",
  "==",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "<>",
];

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

app.use(express.json());

const systemPrompt = `You are a Salesforce formula expert. Follow these rules STRICTLY:

1. Return ONLY valid Salesforce formula code using these EXCLUSIVE functions/operators:
   - Functions: ${supportedFunctions.join(", ")}
   - Operators: ${supportedOperators.join(" ")}

2. Field Reference Format:
   - ALWAYS use $ObjectApiName.FieldApiName 
   - Example: $Opportunity.Amount NOT Amount

3. Syntax Requirements:
   - Text/Picklist values: "Closed"
   - Numbers: 500 (no quotes)
   - Percentages: 0.15 NOT 15%
   - Dates: TODAY() + 7 or ADDDAYS($CustomObject.DateField__c, 3)

4. Error Handling:
   - Wrap field references in ISBLANK() checks
   - Handle nulls for all field operations

5. Strict Requirements:
   - NO comments or explanations
   - Use EXACT API names with proper casing
   - Prefer built-in functions over operators
   - Validate picklist values with ISPICKVAL()
   - Use ISBlANK function only on the possible string fields

Examples:

Input: "10% discount when Stage is Closed Won"
Output: 
IF(ISPICKVAL($Opportunity.StageName, "Closed Won"), $Opportunity.Amount * 0.10, 0)

Input: "Account billing state matches shipping"
Output: 
$Account.BillingState == $Account.ShippingState

Input: "Opportunity created in last 30 days"
Output: 
TODAY() - DATEVALUE($Opportunity.CreatedDate) <= 30

Input: "High priority if contains 'urgent'"
Output: 
IF(CONTAINS($Case.Subject, "urgent"), "High", "Normal")

Now process: {input}`;

app.post("/generate-formula", async (req, res) => {
  try {
    const { input, sessionId } = req.body;
    if (!input) {
      return res.status(400).json({ error: "No input provided" });
    }

    // Get or create session
    let currentSessionId = sessionId || generateSessionId();
    let session = sessions.get(currentSessionId);

    if (!session) {
      session = {
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      };
      sessions.set(currentSessionId, session);
    }

    // Add user message to history
    session.messages.push({ role: "user", content: input });

    // Get API response
    const response = await client.path("/chat/completions").post({
      body: {
        messages: session.messages,
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 4096,
        top_p: 1,
      },
    });

    if (isUnexpected(response)) {
      throw new Error(response.body.error);
    }

    // Process formula response
    const rawFormula = response.body.choices[0].message.content;
    const codeBlockPattern = /```.*?\n(.*?)```/gs;
    const match = codeBlockPattern.exec(rawFormula);

    let formula = rawFormula;
    if (match) {
      formula = match[1].trim();
    } else {
      formula = formula.replace(/`/g, "").trim();
    }

    // Store assistant response
    session.messages.push({ role: "assistant", content: rawFormula });

    // Return response with session ID
    res.json({
      formula: formula,
      input: input,
      sessionId: currentSessionId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});
