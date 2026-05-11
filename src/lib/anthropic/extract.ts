import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt";
import {
  extractionToolSchema,
  EXTRACTION_TOOL_NAME,
  type ExtractionResult,
} from "./extraction-schema";

export type ExtractOptions = {
  apiKey: string;
  model: string;
  pdfBase64: string;
  /** Optional extra user-message text (e.g. "this is the second pass; phrase differently"). */
  extraInstruction?: string;
};

export type ExtractResponse = {
  result: ExtractionResult;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  raw_tool_input: unknown;
};

/**
 * Send a PDF to Claude with the extraction tool. Returns the parsed structured
 * output plus token usage. Throws on Anthropic errors or malformed responses.
 */
export async function extractBill(opts: ExtractOptions): Promise<ExtractResponse> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });

  const response = await anthropic.messages.create({
    model: opts.model,
    max_tokens: 16000,
    system: EXTRACTION_SYSTEM_PROMPT,
    tools: [
      {
        name: EXTRACTION_TOOL_NAME,
        description: "Return the structured extraction of the municipal bill PDF.",
        input_schema: extractionToolSchema,
      },
    ],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: opts.pdfBase64,
            },
          },
          {
            type: "text",
            text:
              (opts.extraInstruction ? opts.extraInstruction + "\n\n" : "") +
              "Extract this bill using the extract_municipal_bill tool. Apply all extraction rules from the system prompt.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === EXTRACTION_TOOL_NAME,
  );

  if (!toolUse) {
    throw new Error(
      `Anthropic did not call the ${EXTRACTION_TOOL_NAME} tool. stop_reason=${response.stop_reason}`,
    );
  }

  return {
    result: toolUse.input as ExtractionResult,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    model: response.model,
    raw_tool_input: toolUse.input,
  };
}
