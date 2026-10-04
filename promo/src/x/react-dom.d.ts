// @types/react-dom を依存に足さずに、Caption（X 版の下の帯への字幕）が使う createPortal だけ型を与える
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
