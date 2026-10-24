export function splitArgs(commandLine: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;
  let backslashes = 0;
  for (const char of commandLine) {
    if (char === "\\") {
      backslashes += 1;
      hasToken = true;
    } else if (char === '"') {
      current += "\\".repeat(Math.floor(backslashes / 2));
      if (backslashes % 2 === 1) current += '"';
      else inQuotes = !inQuotes;
      backslashes = 0;
      hasToken = true;
    } else if (/\s/.test(char) && !inQuotes) {
      current += "\\".repeat(backslashes);
      backslashes = 0;
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
    } else {
      current += "\\".repeat(backslashes) + char;
      backslashes = 0;
      hasToken = true;
    }
  }
  current += "\\".repeat(backslashes);
  if (hasToken) args.push(current);
  return args;
}

export function joinArgs(args: string[]): string {
  return args.map(quoteArg).join(" ");
}

function quoteArg(arg: string): string {
  if (arg.length > 0 && !/[\s"]/.test(arg)) return arg;
  let quoted = '"';
  let backslashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      backslashes += 1;
    } else if (char === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
    } else {
      quoted += "\\".repeat(backslashes) + char;
      backslashes = 0;
    }
  }
  return quoted + "\\".repeat(backslashes * 2) + '"';
}
