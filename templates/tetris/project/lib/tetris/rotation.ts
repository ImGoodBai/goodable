/**
 * SRS旋转系统 - 顺时针旋转90度
 * 使用标准的矩阵转置+反转算法
 */
export function rotateMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const rotated: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      rotated[x][n - 1 - y] = matrix[y][x];
    }
  }

  return rotated;
}

/**
 * 获取旋转后的形状
 */
export function getRotatedShape(
  shape: number[][],
  rotation: 0 | 1 | 2 | 3
): number[][] {
  let result = shape;
  for (let i = 0; i < rotation; i++) {
    result = rotateMatrix(result);
  }
  return result;
}
