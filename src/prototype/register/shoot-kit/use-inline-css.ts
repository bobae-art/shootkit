// 촬영 화면 스타일은 화면이 떠 있는 동안만 <style>로 넣는다(2026-10-25).
// ?register=shoot 과 ?register=shootkit 이 같은 이름의 클래스(.shoot-*)를 쓰므로, 한 페이지에 두 스타일이 함께 들어가 서로 덮지 않게 한다.
import { useInsertionEffect } from "react";

export function useInlineCss(id: string, css: string) {
  useInsertionEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      el.textContent = css;
      document.head.appendChild(el);
    }
    return () => el?.remove();
  }, [id, css]);
}
