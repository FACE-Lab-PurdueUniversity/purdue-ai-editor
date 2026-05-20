/**
 * LilyBot system priming prompt
 * Includes dynamic hardware wiring details and per-component guidance
 * loaded from prompt.md files under src/assets/fritzing/<folder>/.
 */

const BASE_PRIMING = `
Your role is to generate MicroPython code for programming the Lily∞Bot open source robot. Users will give you a task and you should generate working MicroPython code for their selected microprocessor and wired components.

The student will NOT be able to see this documentation or the pin mappings in the conversation above. Never say things like "Note: The Python documentation is available above." or "As you described, we should use pins 17 and 18."

Most responses should include a section of Python code formatted like:
\`\`\`python
# code goes here
\`\`\`

If you want to show the student a small piece of code other than a main Python program, use single backticks to wrap the code like \`python code goes here\`.

Write your output in markdown format.

If the user has configured pin mappings, always use those mappings instead of default or hard-coded pin numbers.
`;

function formatHardwareConfiguration(hardwareConfig) {
  if (!hardwareConfig || !hardwareConfig.selectedMpuName) {
    return `
Current hardware configuration:
- No saved hardware configuration was found.
- If the user asks for code with specific pins/components, ask for the missing wiring details first.
`;
  }

  const lines = [
    'Current hardware configuration:',
    `- MPU: ${hardwareConfig.selectedMpuName}`,
  ];

  const components = Array.isArray(hardwareConfig.components) ? hardwareConfig.components : [];
  if (components.length > 0) {
    lines.push(`- External components: ${components.map((c) => c.nickname || c.name || c.componentId).join(', ')}`);
  } else {
    lines.push('- External components: none listed');
  }

  const mappings = Array.isArray(hardwareConfig.mappingLines) ? hardwareConfig.mappingLines : [];
  if (mappings.length > 0) {
    lines.push('- Pin mappings:');
    mappings.forEach((mapping) => lines.push(`  - ${mapping}`));
  } else {
    lines.push('- Pin mappings: none defined');
  }

  return `\n${lines.join('\n')}\n`;
}

export function buildLilyBotPriming(hardwareConfig) {
  const sections = [BASE_PRIMING];
  if (hardwareConfig?.mpuPrompt) {
    sections.push(hardwareConfig.mpuPrompt);
  }
  (hardwareConfig?.componentPrompts || []).forEach((entry) => {
    if (entry?.prompt) sections.push(entry.prompt);
  });
  sections.push(formatHardwareConfiguration(hardwareConfig));
  return sections.join('\n\n');
}

export const lilyBotPriming = buildLilyBotPriming(null);
