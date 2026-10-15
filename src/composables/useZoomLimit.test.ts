import { describe, expect, it } from 'vitest'
import { MIN_MAX_ZOOM } from './useHexWindow'
import { useZoomLimit, zoomLimit } from './useZoomLimit'

describe('zoomLimit', () => {
  it('goes as far as the world allows when nothing was chosen', () => {
    expect(zoomLimit(null, 300)).toBe(300)
  })

  it('holds the camera closer when the viewer asks', () => {
    expect(zoomLimit(150, 300)).toBe(150)
  })

  it('never lets a choice made on a bigger world run past this one', () => {
    expect(zoomLimit(280, 225)).toBe(225)
  })

  it('never narrows the view past the floor', () => {
    expect(zoomLimit(5, 300)).toBe(MIN_MAX_ZOOM)
  })
})

describe('useZoomLimit', () => {
  it("reads the slider at its end as every world's own end", () => {
    const { farthest, limit, choose } = useZoomLimit()
    farthest.value = 225
    choose(225)
    farthest.value = 300
    expect(limit.value).toBe(300)

    choose(120)
    farthest.value = 225
    expect(limit.value).toBe(120)
  })
})
