/**
 * Runs inside the preview frame. HyperFrames does the clip scheduling when it
 * renders; here a few lines do the same so the page plays like the final video.
 * It only talks to the parent window, by postMessage. The voice plays in the parent
 * (a sandboxed frame may not start sound from a click made outside it): its time
 * comes in as regie:sync and keeps this clock on the voice.
 */
export const PREVIEW_SHIM = `
(function(){
  var tl = window.__timelines && window.__timelines.main;
  var root = document.getElementById("root");
  var total = parseFloat(root.dataset.duration) || 0;
  var audio = document.getElementById("vo");
  var clips = [].slice.call(document.querySelectorAll(".clip")).map(function(el){
    var s = parseFloat(el.dataset.start) || 0;
    return { el: el, s: s, e: s + (parseFloat(el.dataset.duration) || 0) };
  });
  var t = 0, playing = false, t0 = 0, w0 = 0;
  function fit(){
    var k = Math.min(innerWidth / 1080, innerHeight / 1920);
    document.documentElement.style.transformOrigin = "0 0";
    document.documentElement.style.transform = "scale(" + k + ")";
  }
  function show(x){
    t = Math.max(0, Math.min(total, x));
    for (var i = 0; i < clips.length; i++) { var c = clips[i]; c.el.style.visibility = t >= c.s && t < c.e ? "visible" : "hidden"; }
    if (tl) tl.seek(t, false);
    parent.postMessage({ type: "regie:time", t: t, playing: playing, total: total }, "*");
  }
  function tick(){
    if (!playing) return;
    var x = audio && !audio.paused ? audio.currentTime : w0 + (performance.now() - t0) / 1000;
    if (x >= total) { playing = false; if (audio) audio.pause(); show(total); return; }
    show(x);
    requestAnimationFrame(tick);
  }
  function play(){
    if (t >= total - 0.05) t = 0;
    playing = true; w0 = t; t0 = performance.now();
    if (audio) { audio.currentTime = t; var p = audio.play(); if (p && p.catch) p.catch(function(){}); }
    requestAnimationFrame(tick);
  }
  function pause(){ playing = false; if (audio) audio.pause(); show(t); }
  addEventListener("message", function(ev){
    if (ev.source !== parent || !ev.data || typeof ev.data.type !== "string") return;
    var d = ev.data;
    if (d.type === "regie:seek" && typeof d.t === "number" && isFinite(d.t)) { if (audio) audio.currentTime = Math.max(0, d.t); w0 = d.t; t0 = performance.now(); show(d.t); }
    else if (d.type === "regie:sync" && typeof d.t === "number" && isFinite(d.t)) { w0 = d.t; t0 = performance.now(); }
    else if (d.type === "regie:play") play();
    else if (d.type === "regie:pause") pause();
  });
  addEventListener("resize", fit);
  fit();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){
    show(0);
    parent.postMessage({ type: "regie:ready", total: total }, "*");
  });
})();
`;
