/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 冒頭のバナー約 40 枚の背景ぼかし（backdrop-filter）が重く、並列 5 本だとタブ同士が CPU を取り合って
// 1 フレームが 30 秒の既定タイムアウトを越える。並列を絞り、待ち時間を延ばす
Config.setConcurrency(2);
Config.setTimeoutInMilliseconds(180000);
