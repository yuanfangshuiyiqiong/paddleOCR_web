import * as pdfjsLib from 'pdfjs-dist'

// 设置 worker，避免跨域问题
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * 将 PDF 文件渲染为 dataURL（PNG/JPEG）
 * @param file PDF 文件对象
 * @param pageIndex 页码（从 1 开始，默认第 1 页）
 * @param scale 缩放比例，默认 2（高清）
 * @returns 渲染后的图片 dataURL
 */
export async function renderPdfToDataURL(
  file: File,
  pageIndex: number = 1,
  scale: number = 2
): Promise<{ dataURL: string; width: number; height: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // 默认取第 1 页（pageIndex 从 1 开始）
  const page = await pdf.getPage(pageIndex)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({
    canvasContext: context,
    viewport,
  }).promise

  const dataURL = canvas.toDataURL('image/png')
  return {
    dataURL,
    width: viewport.width / scale,
    height: viewport.height / scale,
  }
}

/**
 * 获取 PDF 总页数
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  return pdf.numPages
}
