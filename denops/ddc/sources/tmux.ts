import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.3.0/types.ts#^";

export class Source extends BaseSource {
  async gatherCandidates(...args: any[]): Promise<Candidate[]> {
    const panes = await this.panes();
    const results = await Promise.all(panes.map((id) => this.capturePane(id)));
    console.log(results)
    return this.allWords(results.flat()).map((word) => ({ word }));
  }

  private async runCmd(cmd: string[]): Promise<string[]> {
    const p = Deno.run({ cmd, stdout: "piped", stderr: "null", stdin: "null" });
    await p.status();
    return new TextDecoder().decode(await p.output()).split(/\n/);
  }

  private async panes(): Promise<string[]> {
    return this.runCmd(["tmux", "list-panes", "-a", "-F", "#D"]);
  }

  private async capturePane(id: string): Promise<string[]> {
    return this.runCmd(["tmux", "capture-pane", "-J", "-p", "-t", id]);
  }

  private allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\w\d]+/g)])
      .map((match) => match[0])
    return Array.from(new Set(words)) // remove duplication
  }
}
