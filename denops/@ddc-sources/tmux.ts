import { Denops, fn } from "https://deno.land/x/ddc_vim@v3.1.0/deps.ts";
import { BaseSource, Item } from "https://deno.land/x/ddc_vim@v3.1.0/types.ts";
import {
  GatherArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v3.1.0/base/source.ts";

type Params = {
  currentWinOnly: boolean;
  excludeCurrentPane: boolean;
  executable: string;
  kindFormat: string;
};

interface PaneInfo {
  kind: string;
  id: string;
}

export class Source extends BaseSource<Params> {
  private available = false;
  private defaultExecutable = "tmux";
  private executable = "";

  async onInit(
    { denops, sourceParams }: OnInitArguments<Params>,
  ): Promise<void> {
    // old ddc.vim has no sourceParams here
    const executable = sourceParams
      ? sourceParams.executable
      : this.defaultExecutable;
    if (typeof executable !== "string") {
      await this.print_error(denops, "executable should be a string");
      return;
    }
    if ((await fn.executable(denops, executable)) !== 1) {
      await this.print_error(denops, "executable not found");
      return;
    }
    this.available = true;
    this.executable = executable;
  }

  async gather({
    sourceParams,
  }: GatherArguments<Params>): Promise<Item[]> {
    if (!this.available) {
      return [];
    }
    const paneInfos = await this.panes(sourceParams);
    const results = await Promise.all(
      paneInfos.map(({ kind, id }) =>
        this.capturePane(id).then((result) => ({ kind, result }))
      ),
    );
    return results.reduce<Item[]>((a, { kind, result }) => {
      for (const word of this.allWords(result)) {
        a.push({ word, kind });
      }
      return a;
    }, []);
  }

  params(): Params {
    return {
      currentWinOnly: false,
      excludeCurrentPane: false,
      executable: this.defaultExecutable,
      kindFormat: "#{session_name}:#{window_index}.#{pane_index}",
    };
  }

  private async runCmd(cmd: string[]): Promise<string[]> {
    const p = Deno.run({ cmd, stdout: "piped", stderr: "piped" });
    const [status, out, err] = await Promise.all([
      p.status(),
      p.output(),
      p.stderrOutput(),
    ]);
    p.close();
    const d = new TextDecoder();
    if (status.success) {
      return d.decode(out).split(/\n/);
    }
    throw new Error(d.decode(err));
  }

  private async panes(
    { currentWinOnly, excludeCurrentPane, kindFormat }: Params,
  ): Promise<PaneInfo[]> {
    const sep = "\x1f"; // U+001F UNIT SEPARATOR
    const lines = await this.runCmd([
      this.executable,
      "list-panes",
      "-F",
      [kindFormat, "#D", "#{pane_active}"].join(sep),
      ...(currentWinOnly ? [] : ["-a"]),
    ]).catch((e) => {
      if (e instanceof Error && /no server running/.test(e.message)) {
        return [] as string[];
      }
      throw e;
    });
    return lines.reduce<PaneInfo[]>((a, b) => {
      const cells = b.split(sep);
      if (cells.length === 3) {
        const [kind, id, paneActive] = cells;
        if (!excludeCurrentPane || paneActive !== "1") {
          a.push({ kind, id });
        }
      }
      return a;
    }, []);
  }

  private capturePane(id: string): Promise<string[]> {
    return this.runCmd([this.executable, "capture-pane", "-p", "-J", "-t", id]);
  }

  private allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\p{L}\d]+/gu)])
      .map((match) => match[0]);
    return Array.from(new Set(words)); // remove duplication
  }

  private async print_error(denops: Denops, message: string): Promise<void> {
    await denops.call("ddc#util#print_error", message, "ddc-tmux");
  }
}
