import { createInterface } from "readline";

export function prompt(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`? ${message} > `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function promptSecret(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`? ${message} > `);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    let input = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === "\n" || c === "\r") {
        if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(input.trim());
      } else if (c === "\u007f" || c === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (c === "\u0003") {
        // Ctrl+C
        process.exit(1);
      } else {
        input += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
