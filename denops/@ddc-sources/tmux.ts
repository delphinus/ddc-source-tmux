import { Denops, fn } from "https://deno.land/x/ddc_vim@v4.3.1/deps.ts";
import { BaseSource, Item } from "https://deno.land/x/ddc_vim@v4.3.1/types.ts";
import {
  GatherArguments,
  GetCompletePositionArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v4.3.1/base/source.ts";

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

const DECODER = new TextDecoder();
const SEP = "\x1f"; // U+001F UNIT SEPARATOR

export class Source extends BaseSource<Params> {
  #available = false;
  #executable = "";

  override async onInit(
    { denops, sourceParams }: OnInitArguments<Params>,
  ): Promise<void> {
    const { executable } = sourceParams;
    if (typeof executable !== "string") {
      await this.#printError(denops, "executable should be a string");
      return;
    }
    if ((await fn.executable(denops, executable)) !== 1) {
      await this.#printError(denops, "executable not found");
      return;
    }
    this.#available = true;
    this.#executable = executable;
  }

  override getCompletePosition(
    { context }: GetCompletePositionArguments<Params>,
  ): number {
    return context.input.search(/[-_\p{L}\d]+$/u);
  }

  override async gather(
    { sourceParams }: GatherArguments<Params>,
  ): Promise<Item[]> {
    if (!this.#available) {
      return [];
    }
    const paneInfos = await this.#panes(sourceParams);
    const results = await Promise.all(
      paneInfos.map(({ kind, id }) =>
        this.#capturePane(id).then((result) => ({ kind, result }))
      ),
    );
    return results.reduce<Item[]>(
      (a, { kind, result }) =>
        a.concat(this.#allWords(result).map((word) => ({ word, kind }))),
      [],
    );
  }

  override params(): Params {
    return {
      currentWinOnly: false,
      excludeCurrentPane: false,
      executable: "tmux",
      kindFormat: "#{session_name}:#{window_index}.#{pane_index}",
    };
  }

  async #runCmd(args: string[]): Promise<string[]> {
    const { success, stdout, stderr } = await new Deno.Command(
      this.#executable,
      { args, stdout: "piped", stderr: "piped" },
    ).output();
    if (success) {
      return DECODER.decode(stdout).split(/\n/);
    }
    throw new Error(DECODER.decode(stderr));
  }

  async #panes(
    { currentWinOnly, excludeCurrentPane, kindFormat }: Params,
  ): Promise<PaneInfo[]> {
    const lines = await this.#runCmd([
      "list-panes",
      "-F",
      [kindFormat, "#D", "#{pane_active}"].join(SEP),
      ...(currentWinOnly ? [] : ["-a"]),
    ]).catch((e: unknown) => {
      if (e instanceof Error && /no server running/.test(e.message)) {
        return [];
      }
      throw e;
    });
    return lines.reduce<PaneInfo[]>((a, b) => {
      const cells = b.split(SEP);
      if (cells.length === 3) {
        const [kind, id, paneActive] = cells;
        if (!excludeCurrentPane || paneActive !== "1") {
          a.push({ kind, id });
        }
      }
      return a;
    }, []);
  }

  async #capturePane(id: string): Promise<string[]> {
    return await this.#runCmd(["capture-pane", "-p", "-J", "-t", id]);
  }

  #allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\p{L}\d]+/gu)])
      .map((match) => match[0]);
    return Array.from(new Set(words)); // remove duplication
  }

  async #printError(denops: Denops, message: string): Promise<void> {
    await denops.call("ddc#util#print_error", message, "ddc-tmux");
  }
}
