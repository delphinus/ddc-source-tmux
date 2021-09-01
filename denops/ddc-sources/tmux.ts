import { fn } from "https://deno.land/x/ddc_vim@v0.3.0/deps.ts#^";
import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.3.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.3.0/base/source.ts#^";

interface Params {
  currentWinOnly: boolean;
}

export class Source extends BaseSource {
  private available = false;

  async onInit({ denops }: OnInitArguments): Promise<void> {
    const hasExecutable = (await fn.executable(denops, "tmux")) === 1;
    const env = Deno.env.get("TMUX");
    const inTmux = typeof env === "string" && env !== "";
    this.available = hasExecutable && inTmux;
  }

  async gatherCandidates({
    sourceParams,
  }: GatherCandidatesArguments): Promise<Candidate[]> {
    if (!this.available) {
      return [];
    }
    const { currentWinOnly } = (sourceParams as unknown) as Params;
    const panes = await this.panes(currentWinOnly);
    const results = await Promise.all(panes.map((id) => this.capturePane(id)));
    return this.allWords(results.flat()).map((word) => ({ word }));
  }

  params(): Record<string, unknown> {
    return {
      currentWinOnly: false,
    }
  }

  private async runCmd(cmd: string[]): Promise<string[]> {
    const p = Deno.run({ cmd, stdout: "piped" });
    await p.status();
    return new TextDecoder().decode(await p.output()).split(/\n/);
  }

  private panes(currentWinOnly?: boolean): Promise<string[]> {
    return this.runCmd([
      "tmux",
      "list-panes",
      "-F",
      "#D",
      ...(currentWinOnly ? [] : ["-a"]),
    ]);
  }

  private capturePane(id: string): Promise<string[]> {
    return this.runCmd(["tmux", "capture-pane", "-p", "-J", "-t", id]);
  }

  private allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\p{L}\d]+/gu)])
      .map((match) => match[0]);
    return Array.from(new Set(words)); // remove duplication
  }
}
