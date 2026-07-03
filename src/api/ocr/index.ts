import request from '@/utils/request'
import { AxiosPromise } from 'axios'

export interface OCRBlock {
  text: string
  confidence: number
  box: number[][]
}

export interface OCRResult {
  success: boolean
  filename: string
  total_pages: number
  total_text_blocks: number
  processing_time_ms: number
  device: string
  use_gpu: boolean
  pages: OCRPage[]
}

export interface OCRPage {
  page: number
  blocks: OCRBlock[]
}

/** predict 接口的响应结构 */
export interface PredictResponse {
  success: boolean
  filename: string
  total_pages: number
  total_text_blocks: number
  processing_time_ms: number
  device: string
  pages: {
    page: number
    blocks: OCRBlock[]
  }[]
}

/**
 * 调用 /ocr-api/predict，接收截图图片进行 OCR 识别。
 * 返回扁平化结果：blocks + combined_text。
 */
export function predictImage(file: File): AxiosPromise<{ data: { blocks: OCRBlock[]; combined_text: string } }> {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/ocr-api/predict',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  }).then((res: any) => {
    // 展平 predict 接口返回的多页结构，取第一页
    const raw: PredictResponse = res.data
    const firstPage = raw.pages?.[0]
    const blocks: OCRBlock[] = firstPage?.blocks ?? []
    const combined_text = blocks.map((b) => b.text).join('')
    return {
      ...res,
      data: { blocks, combined_text },
    }
  }) as any
}

/**
 * 调用 /ocr-api/ocr（与 predict 相同的后端接口）
 */
export function recognizeImage(file: File): AxiosPromise<OCRResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/ocr-api/ocr',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120000,
  })
}

/**
 * 对已有截图旋转指定角度后重新 OCR 识别。
 * @param file 图片文件
 * @param angle 旋转角度 90 | 180 | 270
 */
export function rotateImage(
  file: File,
  angle: 90 | 180 | 270,
): AxiosPromise<{ data: { blocks: OCRBlock[]; combined_text: string } }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('angle', String(angle))
  return request({
    url: '/ocr-api/rotate-predict',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then((res: any) => {
    const raw: PredictResponse = res.data
    const firstPage = raw.pages?.[0]
    const blocks: OCRBlock[] = firstPage?.blocks ?? []
    const combined_text = blocks.map((b: OCRBlock) => b.text).join('')
    return { ...res, data: { blocks, combined_text } }
  }) as any
}
