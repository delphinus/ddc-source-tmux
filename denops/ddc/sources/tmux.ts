import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.2.1/types.ts#^";
import { Denops } from "https://deno.land/x/ddc_vim@v0.2.1/deps.ts#^";

function allWords(lines: string[]): string[] {
  return lines
    .flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0])
    .filter((e, i, self) => self.indexOf(e) === i);
}

export class Source extends BaseSource {
  async gatherCandidates(args: {
    denops: Denops;
    sourceParams: Record<string, unknown>;
    compelteStr: string;
  }): Promise<Candidate[]> {
    const p = Deno.run({
      cmd: ["tmux", "list-panes", "-a", "-F", "#D"],
    });
    const output = await p.output();
    const out = new TextDecoder().decode(output);
    p.close();
    return allWords(out.split(/\n/)).map((word) => ({ word }));
  }
}
