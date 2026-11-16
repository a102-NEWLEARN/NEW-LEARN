// GA4 + Microsoft Clarity — 운영 도메인에서만 동작 (로컬 개발 데이터 제외)
// CSP 가 인라인 스크립트를 막아서 index.html 이 아닌 같은 출처 파일로 둔다 (script-src 'self')
(function () {
  if (!location.hostname.endsWith("newlearn.io.kr")) return;

  // Google Analytics 4
  var GA_ID = "G-5BS938CRPE";
  var ga = document.createElement("script");
  ga.async = true;
  ga.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(ga);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);

  // Microsoft Clarity
  (function (c, l, a, r, i, t, y) {
    c[a] =
      c[a] ||
      function () {
        (c[a].q = c[a].q || []).push(arguments);
      };
    t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "zdak5z2kfc");
})();
