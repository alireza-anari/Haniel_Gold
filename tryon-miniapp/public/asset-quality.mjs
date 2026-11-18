/** Pure, on-device validation for an approved jewelry cutout. No network calls. */
export function inspectAlphaMask({width, height, data}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length !== width * height * 4) {
    throw new Error('INVALID_IMAGE_DATA');
  }
  const pixels = width * height;
  let visible = 0, translucent = 0, background = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 235) background++;
      if (alpha >= 20 && alpha < 235) translucent++;
      if (alpha > 20) {
        visible++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!visible || visible < Math.max(4, Math.ceil(pixels * .002))) {
    return {ok:false, reason:'EMPTY_FOREGROUND', bbox:null, warnings:[]};
  }
  const corners = [0, width - 1, (height - 1) * width, pixels - 1];
  const opaqueCorners = corners.filter(p => data[p * 4 + 3] > 230).length;
  if (background / pixels < .05 || opaqueCorners === 4) {
    return {ok:false, reason:'OPAQUE_BACKGROUND', bbox:null, warnings:[]};
  }
  const bbox = {x:minX, y:minY, width:maxX - minX + 1, height:maxY - minY + 1};
  const density = visible / (bbox.width * bbox.height);
  const warnings = [];
  if (translucent / visible > .55) warnings.push('SOFT_OR_HALO_EDGES');
  if (density < .06 || visible / pixels < .02) warnings.push('SPARSE_OR_THIN_PRODUCT');
  if (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) warnings.push('TOUCHES_FRAME');
  return {ok:true, reason:null, bbox, warnings, coverage:Number((visible / pixels).toFixed(4))};
}

export function cutoutQualityMessage(quality) {
  if (!quality.ok) return quality.reason === 'EMPTY_FOREGROUND'
    ? 'تصویر محصول خالی است یا بخش قابل مشاهده کافی ندارد.'
    : 'پس‌زمینه محصول کاملاً شفاف نیست. از فایل PNG یا WebP با برش دقیق استفاده کن.';
  if (quality.warnings.includes('SOFT_OR_HALO_EDGES')) return 'دارایی محصول بارگذاری شد، اما لبه‌های نیمه‌شفاف آن باید از نظر هاله و انعکاس بررسی شوند.';
  if (quality.warnings.includes('TOUCHES_FRAME')) return 'دارایی محصول بارگذاری شد؛ ممکن است بخشی از زنجیر در لبه تصویر بریده شده باشد.';
  if (quality.warnings.includes('SPARSE_OR_THIN_PRODUCT')) return 'دارایی محصول بارگذاری شد؛ جزئیات زنجیر بسیار باریک‌اند و تأیید بصری لازم است.';
  return 'تصویر شفاف بارگذاری شد. اصالت شکل و رنگ محصول باید با مرجع واقعی مقایسه شود.';
}
