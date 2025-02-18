// api/index.js
import express from "express";
import dotenv from "dotenv";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const app = express();
dotenv.config();

console.log(process.env.GITHUB_TOKEN);

app.use(express.json());

const systemPrompt = `You are a Salesforce formula expert. Follow these rules:
1. Return ONLY valid Salesforce formula code
2. Use standard objects/fields (Account, Contact, Opportunity, etc.)
3. Include error handling with ISBLANK() where applicable
4. Follow Salesforce formula syntax rules strictly
5. Always prioritize built-in functions over custom logic
6. Handle date/time conversions properly
7. Use proper casing for standard field names
8. Include comments with /* */ syntax for complex logic

Examples:
Input: "10% discount on Amount"
Output: Opportunity.Amount * 0.10

Input: "Check if close date is in current quarter"
Output: 
DATEVALUE(CloseDate) >= DATE(YEAR(TODAY()), FLOOR(MONTH(TODAY())/3)*3+1, 1) && 
DATEVALUE(CloseDate) < DATE(YEAR(TODAY()), FLOOR(MONTH(TODAY())/3)*3+4, 1)

Now process: {input}`;

app.post("/generate-formula", async (req, res) => {
  try {
    const userInput = req.body.input;
    if (!userInput) {
      return res.status(400).json({ error: "No input provided" });
    }

    const client = ModelClient(
      "https://models.github.ai/inference",
      new AzureKeyCredential(process.env.GITHUB_TOKEN)
    );

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: systemPrompt.replace("{input}", userInput),
          },
          { role: "user", content: userInput },
        ],
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 4096,
        top_p: 1,
      },
    });

    if (isUnexpected(response)) {
      throw new Error(response.body.error);
    }

    const rawFormula = response.body.choices[0].message.content;
    const codeBlockPattern = /```.*?\n(.*?)```/gs;
    const match = codeBlockPattern.exec(rawFormula);

    let formula = rawFormula;
    if (match) {
      formula = match[1].trim();
    } else {
      formula = formula.replace(/`/g, "").trim();
    }

    res.json({
      formula: formula,
      input: userInput,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default app;
