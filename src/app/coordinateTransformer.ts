import type { Image as FabricImage } from 'fabric'

/**
 * CoordinateTransformer
 * =====================================================================
 * 项目中唯一的坐标转换入口。
 *
 * 三套坐标体系：
 *
 *   1. display（Fabric 世界坐标 / 画布坐标）
 *      - Fabric Canvas 上 `canvas.getPointer()` 返回的就是这个
 *      - 单位：CSS 像素
 *      - 受 `canvas.zoom()`、`canvas.viewportTransform` 影响
 *      - 与画布上的「背景图 Image 对象」一致 —— 背景图在画布上占据的就是这个矩形
 *
 *   2. natural（图片自然像素坐标）
 *      - 图片源文件本身的像素 (HTMLImageElement.naturalWidth × naturalHeight)
 *      - 用于 ctx.drawImage 裁剪、Image.fromURL 构造
 *
 *   3. ocrLocal（OCR 局部坐标 / Crop 坐标）
 *      - 后端 OCR 返回的 `box` 是相对**上传给后端的截图**的左上角
 *      - 不是相对整张原图
 *
 * 关键公式（背景图：left/top 是它相对画布原点的偏移；scaleX/scaleY 是自然→显示的缩放）：
 *
 *   naturalX = (displayX - bg.left) / bg.scaleX
 *   displayX = naturalX * bg.scaleX + bg.left
 *
 *   ocrLocal → display（叠加 crop 偏移，不受 bg.left/top 影响，因为 crop 内部坐标系已经独立）：
 *   displayX = cropDisplayLeft + ocrLocalX * bg.scaleX
 *   displayY = cropDisplayTop + ocrLocalY * bg.scaleY
 *
 * 设计要点：
 *   - 本类**不知道** Fabric Canvas，也没有 canvas 引用；
 *   - 背景图通过构造时注入的 `getBackgroundImage()` 闭包获取；
 *   - 规格：背景图以「普通 Image 对象」存在于 canvas.getObjects() 中，
 *          识别规则 type === 'image' && name === 'image'。
 *     调用方必须遵守 —— 见 fabricTool.ts#getBackgroundImage()。
 *
 * =====================================================================
 * 修改记录：
 *   - 任何缩放 / 居中 / viewport 相关逻辑变更，只动这一个文件即可。
 *   - 重构：撤销所有 canvas.backgroundImage 依赖，
 *          改用构造函数注入的 getBackgroundImage()。
 * =====================================================================
 */

export type Rect = { left: number; top: number; width: number; height: number }
export type Point = { x: number; y: number }
export type GetBackgroundImageFn = () => FabricImage | null

export class CoordinateTransformer {
  constructor(private readonly getBackgroundImage: GetBackgroundImageFn) {}

  // ------------------------------------------------------------------
  // 内部：取背景图（统一入口）
  // ------------------------------------------------------------------
  private get bg(): FabricImage | null {
    return this.getBackgroundImage() ?? null
  }

  /** 背景图在画布上的左偏移（display 坐标） */
  private get bgLeft(): number {
    return this.bg?.left ?? 0
  }

  /** 背景图在画布上的上偏移（display 坐标） */
  private get bgTop(): number {
    return this.bg?.top ?? 0
  }

  /** 自然 → 显示 缩放系数（X / Y） */
  private get bgScaleX(): number {
    return this.bg?.scaleX ?? 1
  }
  private get bgScaleY(): number {
    return this.bg?.scaleY ?? 1
  }

  /** 防御：scaleX/scaleY 为 0 时降级为 1，避免除零 */
  private safeScale(s: number): number {
    return s > 0 ? s : 1
  }

  // ------------------------------------------------------------------
  // 1) displayToNatural
  //    display 坐标（Fabric 世界坐标）→ natural 坐标（图片自然像素）
  // ------------------------------------------------------------------
  displayToNatural(p: Point): Point {
    const sX = this.safeScale(this.bgScaleX)
    const sY = this.safeScale(this.bgScaleY)
    return {
      x: (p.x - this.bgLeft) / sX,
      y: (p.y - this.bgTop) / sY,
    }
  }

  // ------------------------------------------------------------------
  // 2) displayRectToNatural
  //    display 矩形（用户框选）→ natural 矩形（用于 ctx.drawImage 裁剪）
  // ------------------------------------------------------------------
  displayRectToNatural(r: Rect): Rect {
    const tl = this.displayToNatural({ x: r.left, y: r.top })
    const sX = this.safeScale(this.bgScaleX)
    const sY = this.safeScale(this.bgScaleY)
    return {
      left: tl.x,
      top: tl.y,
      width: r.width / sX,
      height: r.height / sY,
    }
  }

  // ------------------------------------------------------------------
  // 3) naturalToDisplay
  //    natural 坐标 → display 坐标（Fabric 世界坐标）
  // ------------------------------------------------------------------
  naturalToDisplay(p: Point): Point {
    const sX = this.safeScale(this.bgScaleX)
    const sY = this.safeScale(this.bgScaleY)
    return {
      x: p.x * sX + this.bgLeft,
      y: p.y * sY + this.bgTop,
    }
  }

  // ------------------------------------------------------------------
  // 4) naturalRectToDisplay
  //    natural 矩形 → display 矩形
  // ------------------------------------------------------------------
  naturalRectToDisplay(r: Rect): Rect {
    const tl = this.naturalToDisplay({ x: r.left, y: r.top })
    return {
      left: tl.x,
      top: tl.y,
      width: r.width * this.safeScale(this.bgScaleX),
      height: r.height * this.safeScale(this.bgScaleY),
    }
  }

  // ------------------------------------------------------------------
  // 5) cropToDisplay
  //    给定一张「裁剪区域在画布上的左上角 + OCR 局部坐标」
  //    → 画布上对应点（用于把 OCR box 还原到画布坐标）
  //
  //    注意：OCR 返回的坐标是相对**这次裁剪的图**的，
  //          不需要再减 bg.left / bg.top，只需要按 scale 放大 + crop 偏移。
  // ------------------------------------------------------------------
  cropToDisplay(
    cropDisplayLeft: number,
    cropDisplayTop: number,
    ocrLocal: Point,
  ): Point {
    const sX = this.safeScale(this.bgScaleX)
    const sY = this.safeScale(this.bgScaleY)
    return {
      x: cropDisplayLeft + ocrLocal.x * sX,
      y: cropDisplayTop + ocrLocal.y * sY,
    }
  }

  // ------------------------------------------------------------------
  // 6) ocrBoxToDisplayRect
  //    OCR 返回的 box（poly 角点，单位是 OCR 局部坐标）
  //    + 裁剪区域在画布上的左上角
  //    → 画布矩形（给 drawBubbleAnnotations / cropBlockImage 直接用）
  //
  //    box 可能是 poly 数组 [[x,y], [x,y], ...]，
  //    也可能直接带 width/height。本函数统一处理。
  // ------------------------------------------------------------------
  ocrBoxToDisplayRect(
    block: { box?: number[][]; width?: number; height?: number },
    cropDisplayLeft: number,
    cropDisplayTop: number,
  ): Rect {
    const box = block.box ?? []
    if (!box.length) {
      return { left: 0, top: 0, width: 0, height: 0 }
    }

    const xs = box.map((p) => p[0] ?? 0)
    const ys = box.map((p) => p[1] ?? 0)
    const ocrLeft = Math.min(...xs)
    const ocrTop = Math.min(...ys)
    const ocrRight = Math.max(...xs)
    const ocrBottom = Math.max(...ys)
    const ocrWidth = Math.max(1, block.width ?? ocrRight - ocrLeft)
    const ocrHeight = Math.max(1, block.height ?? ocrBottom - ocrTop)

    const tl = this.cropToDisplay(cropDisplayLeft, cropDisplayTop, {
      x: ocrLeft,
      y: ocrTop,
    })
    const br = this.cropToDisplay(cropDisplayLeft, cropDisplayTop, {
      x: ocrLeft + ocrWidth,
      y: ocrTop + ocrHeight,
    })

    return {
      left: tl.x,
      top: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
    }
  }

  // ------------------------------------------------------------------
  // 辅助：背景图信息（只读快照）
  // ------------------------------------------------------------------
  getBackgroundInfo() {
    return {
      left: this.bgLeft,
      top: this.bgTop,
      width: this.bg?.width ?? 0,
      height: this.bg?.height ?? 0,
      scaleX: this.bgScaleX,
      scaleY: this.bgScaleY,
      originX: this.bg?.originX,
      originY: this.bg?.originY,
    }
  }
}

// =============================================================
// 纯函数导出（方便单元测试 —— 不依赖任何 Fabric 实例）
// =============================================================

/**
 * display → natural 的纯函数实现。
 * 调用方负责传入 bgLeft / bgTop / bgScaleX / bgScaleY。
 */
export function displayToNaturalPure(
  p: Point,
  bg: { left: number; top: number; scaleX: number; scaleY: number },
): Point {
  const sX = bg.scaleX > 0 ? bg.scaleX : 1
  const sY = bg.scaleY > 0 ? bg.scaleY : 1
  return { x: (p.x - bg.left) / sX, y: (p.y - bg.top) / sY }
}

/**
 * natural → display 的纯函数实现。
 */
export function naturalToDisplayPure(
  p: Point,
  bg: { left: number; top: number; scaleX: number; scaleY: number },
): Point {
  const sX = bg.scaleX > 0 ? bg.scaleX : 1
  const sY = bg.scaleY > 0 ? bg.scaleY : 1
  return { x: p.x * sX + bg.left, y: p.y * sY + bg.top }
}
