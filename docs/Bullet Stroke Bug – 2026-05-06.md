Bullets render at ~17 px on screen but the atlas slot is 128 px — the GPU has to minify the texture to ~14% per axis.

With `LINEAR` filtering and no mipmaps, the GPU samples ONE fragment against a 2×2 texel neighborhood — out of an effective 7×7 texel region per fragment. So per fragment the GPU is looking at a tiny window of the atlas chosen pseudo-randomly based on sub-pixel positioning.

Result: the 12-px-wide outline ring (~9% of the slot) was being aliased away on most fragments. The 65%-of-slot body + core survived the aliasing because they're large enough to always land in any 2×2 window, but the thin outline got missed.

That's why neither the 5.79.14 (3 → 5 px) nor the 5.79.20 (5 → 12 px) outline thickness bumps fixed it — the issue was sampling, not thickness.

Fix (5.79.21)

Two-line change in `webgl-bullet-renderer.js`:

```
gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
```

`generateMipmap` builds a pyramid of pre-downsampled atlas versions:

```
atlas → 512×64 → 256×32 → ... → 1×1
```

With `LINEAR_MIPMAP_LINEAR` (trilinear), the GPU picks the appropriate mip level for the bullet's render scale and bilinear-filters within it.

The outline ring's contribution is preserved through every downsample because each mip texel is the average of adjacent atlas texels — so a fragment that previously missed the outline now hits a mip texel that includes some outline contribution.

Atlas dims are 1024×128 — both powers of 2, so `generateMipmap` works without restriction.

The full mipmap chain adds ~33% to the texture's GPU memory (~170 KB extra) which is negligible.

This is the kind of bug that makes you feel like an idiot when you find it. Mipmaps are the standard solution for “thin features in a downscaled texture become invisible,” and we just didn't have them.

Bumped to 5.79.21. `CHANGELOG.md` updated. 76/76 tests passing. Not committed.