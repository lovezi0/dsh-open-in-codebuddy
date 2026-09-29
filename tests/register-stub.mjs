// 把裸包名 @deepseek-ai/schemastery 重定向到本地替身，供无宿主环境自测使用。
import { register } from "node:module";

register("./stub-hooks.mjs", import.meta.url);
