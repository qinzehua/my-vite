import connect from "connect";
import { blue, green } from "picocolors";
import { optimize } from "../optimizer/index";
import { resolvePlugins } from "../plugins";
import { Plugin } from "../plugin";
import { createPluginContainer, PluginContainer } from "../pluginContainer";
import { indexHtmlMiddware } from "./middlewares/indexHtml";
import { transformMiddleware } from "./middlewares/transform";
import { staticMiddleware } from "./middlewares/static";
import { ModuleGraph } from "../ModuleGraph";
import chokidar, { FSWatcher } from "chokidar";
import { createWebSocketServer } from "../ws";
import { bindingHMREvents } from "../hmr";

export interface ServerContext {
  root: string;
  pluginContainer: PluginContainer;
  app: connect.Server;
  plugins: Plugin[];
  moduleGraph: ModuleGraph;
  ws: { send: (data: any) => void; close: () => void };
  watcher: FSWatcher;
}

export async function startDevServer() {
  const app = connect();
  const root = process.cwd();
  const startTime = Date.now();
  const plugins = resolvePlugins();
  const pluginContainer = createPluginContainer(plugins);
  const moduleGraph = new ModuleGraph((url, importer) =>
    pluginContainer.resolveId(url, importer)
  );
  const watcher = chokidar.watch(root, {
    ignored: ["**/node_modules/**", "**/.git/**"],
    ignoreInitial: true,
  });
  const ws = createWebSocketServer(app);

  const serverContext: ServerContext = {
    root: process.cwd(),
    app,
    pluginContainer,
    plugins,
    moduleGraph,
    ws,
    watcher,
  };

  for (const plugin of plugins) {
    if (plugin.configureServer) {
      await plugin.configureServer(serverContext);
    }
  }
  bindingHMREvents(serverContext);

  // // 核心编译逻辑
  app.use(transformMiddleware(serverContext));
  app.use(indexHtmlMiddware(serverContext));
  app.use(staticMiddleware());

  app.listen(3000, async () => {
    await optimize(root);
    console.log(
      green("🚀 No-Bundle 服务已经成功启动!"),
      `耗时: ${Date.now() - startTime}ms`
    );
    console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
  });
}
