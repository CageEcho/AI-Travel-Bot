"use client";

export type ExportProgress = (message: string) => void;

async function readyForCapture() {
  if (typeof document !== "undefined" && "fonts" in document) await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function pagesOf(root: HTMLElement): HTMLElement[] {
  const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-proposal-page]"));
  if (!pages.length) throw new Error("没有可导出的方案页面");
  return pages;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("导出图片加载失败"));
    image.src = src;
  });
}

/** 将每一张固定 A4 方案页转成 JPEG 后写入多页 PDF，中文由浏览器先渲染，避免字体丢失。 */
export async function exportProposalPdf(root: HTMLElement, filename: string, progress: ExportProgress) {
  progress("正在准备字体和图片…");
  await readyForCapture();
  const pages = pagesOf(root);
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < pages.length; index += 1) {
    progress(`正在生成 PDF 第 ${index + 1} / ${pages.length} 页…`);
    const dataUrl = await toJpeg(pages[index], {
      backgroundColor: "#ffffff",
      cacheBust: true,
      pixelRatio: 1.75,
      quality: 0.94,
    });
    if (index > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  }

  progress("正在下载 PDF…");
  pdf.save(`${filename}.pdf`);
}

/** 将各 A4 页无损拼接成一张长图，适合微信预览与发送。 */
export async function exportProposalPng(root: HTMLElement, filename: string, progress: ExportProgress) {
  progress("正在准备字体和图片…");
  await readyForCapture();
  const pages = pagesOf(root);
  const { toPng } = await import("html-to-image");
  const rendered: HTMLImageElement[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    progress(`正在生成长图第 ${index + 1} / ${pages.length} 页…`);
    const dataUrl = await toPng(pages[index], { backgroundColor: "#ffffff", cacheBust: true, pixelRatio: 1.4 });
    rendered.push(await loadImage(dataUrl));
  }

  const gap = 20;
  const width = Math.max(...rendered.map((image) => image.naturalWidth));
  const height = rendered.reduce((sum, image) => sum + image.naturalHeight, 0) + gap * (rendered.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片导出");
  context.fillStyle = "#eef0f3";
  context.fillRect(0, 0, width, height);
  let top = 0;
  for (const image of rendered) {
    context.drawImage(image, 0, top);
    top += image.naturalHeight + gap;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("长图编码失败")), "image/png"));
  progress("正在下载长图…");
  saveBlob(blob, `${filename}.png`);
}

export function proposalFilename(cities: string[], start: string, version: number) {
  const destination = cities.join("-") || "定制旅程";
  return `BDT-${destination}-${start || "方案"}-v${version}`.replace(/[\\/:*?"<>|\s]+/g, "-");
}
