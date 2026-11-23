/**
 * High-performance dense linear solvers using flat Float64Array storage.
 * - Real linear system A * x = b using Gaussian elimination with scaled partial pivoting.
 * - Complex linear system (A_re + j*A_im) * (x_re + j*x_im) = (b_re + j*b_im) for AC sweep.
 */

const PIVOT_EPS = 1e-18;

/**
 * Reusable workspace for real linear solves so transient simulation
 * performs zero per-step typed-array allocations.
 */
export class LinearWorkspace {
  /**
   * @param {number} n
   */
  constructor(n = 0) {
    this.n = 0;
    this.A = new Float64Array(0);
    this.b = new Float64Array(0);
    this.x = new Float64Array(0);
    this.rowScale = new Float64Array(0);
    this.piv = new Int32Array(0);
    if (n > 0) this.resize(n);
  }

  /**
   * @param {number} n
   */
  resize(n) {
    if (this.n === n) return;
    this.n = n;
    this.A = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.x = new Float64Array(n);
    this.rowScale = new Float64Array(n);
    this.piv = new Int32Array(n);
  }

  clear() {
    this.A.fill(0);
    this.b.fill(0);
  }

  /**
   * Stamp a value into A[row, col].
   * @param {number} row
   * @param {number} col
   * @param {number} val
   */
  addA(row, col, val) {
    this.A[row * this.n + col] += val;
  }

  /**
   * Stamp a value into b[row].
   * @param {number} row
   * @param {number} val
   */
  addB(row, val) {
    this.b[row] += val;
  }

  /**
   * Solve A * x = b in-place (modifies A and b, writes solution into this.x).
   * Uses scaled partial pivoting for numerical stability across conductances
   * spanning 1e-12 S to 1e6 S (18 orders of magnitude!).
   * @returns {{ ok: boolean, singularRow: number }}
   */
  solve() {
    const n = this.n;
    if (n === 0) return { ok: true, singularRow: -1 };

    const A = this.A;
    const b = this.b;
    const x = this.x;
    const scale = this.rowScale;
    const piv = this.piv;

    for (let i = 0; i < n; i++) {
      piv[i] = i;
      let maxAbs = 0;
      const rowOff = i * n;
      for (let j = 0; j < n; j++) {
        const v = Math.abs(A[rowOff + j]);
        if (v > maxAbs) maxAbs = v;
      }
      if (maxAbs < PIVOT_EPS || !Number.isFinite(maxAbs)) {
        return { ok: false, singularRow: i };
      }
      scale[i] = 1 / maxAbs;
    }

    // Forward elimination with scaled partial pivoting
    for (let k = 0; k < n; k++) {
      let bestRow = k;
      let bestRatio = -1;
      for (let i = k; i < n; i++) {
        const pi = piv[i];
        const ratio = Math.abs(A[pi * n + k]) * scale[pi];
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestRow = i;
        }
      }

      if (bestRow !== k) {
        const tmp = piv[k];
        piv[k] = piv[bestRow];
        piv[bestRow] = tmp;
      }

      const pk = piv[k];
      const pkOff = pk * n;
      const pivotVal = A[pkOff + k];

      if (Math.abs(pivotVal) < PIVOT_EPS || !Number.isFinite(pivotVal)) {
        return { ok: false, singularRow: pk };
      }

      const invPivot = 1 / pivotVal;
      for (let i = k + 1; i < n; i++) {
        const pi = piv[i];
        const piOff = pi * n;
        const factor = A[piOff + k] * invPivot;
        if (factor === 0) continue;
        A[piOff + k] = 0;
        for (let j = k + 1; j < n; j++) {
          A[piOff + j] -= factor * A[pkOff + j];
        }
        b[pi] -= factor * b[pk];
      }
    }

    // Back substitution
    for (let i = n - 1; i >= 0; i--) {
      const pi = piv[i];
      const piOff = pi * n;
      let sum = b[pi];
      for (let j = i + 1; j < n; j++) {
        sum -= A[piOff + j] * x[j];
      }
      const val = sum / A[piOff + i];
      if (!Number.isFinite(val)) {
        return { ok: false, singularRow: pi };
      }
      x[i] = val;
    }

    return { ok: true, singularRow: -1 };
  }
}

/**
 * Convenience helper to solve a real linear system A * x = b without mutating inputs.
 * @param {number[][]} matrix
 * @param {number[]} rhs
 * @returns {Float64Array|null}
 */
export function solveRealSystem(matrix, rhs) {
  const n = rhs.length;
  const ws = new LinearWorkspace(n);
  for (let i = 0; i < n; i++) {
    ws.b[i] = rhs[i];
    for (let j = 0; j < n; j++) {
      ws.A[i * n + j] = matrix[i][j];
    }
  }
  const res = ws.solve();
  return res.ok ? new Float64Array(ws.x) : null;
}

/**
 * Reusable workspace for Complex linear systems (A_re + j*A_im) * x = b.
 * Used by AC Small-Signal frequency sweep (Bode plot).
 */
export class ComplexWorkspace {
  /**
   * @param {number} n
   */
  constructor(n = 0) {
    this.n = 0;
    this.Are = new Float64Array(0);
    this.Aim = new Float64Array(0);
    this.bre = new Float64Array(0);
    this.bim = new Float64Array(0);
    this.xre = new Float64Array(0);
    this.xim = new Float64Array(0);
    this.piv = new Int32Array(0);
    this.rowScale = new Float64Array(0);
    if (n > 0) this.resize(n);
  }

  /**
   * @param {number} n
   */
  resize(n) {
    if (this.n === n) return;
    this.n = n;
    this.Are = new Float64Array(n * n);
    this.Aim = new Float64Array(n * n);
    this.bre = new Float64Array(n);
    this.bim = new Float64Array(n);
    this.xre = new Float64Array(n);
    this.xim = new Float64Array(n);
    this.piv = new Int32Array(n);
    this.rowScale = new Float64Array(n);
  }

  clear() {
    this.Are.fill(0);
    this.Aim.fill(0);
    this.bre.fill(0);
    this.bim.fill(0);
  }

  /**
   * @param {number} row
   * @param {number} col
   * @param {number} re
   * @param {number} [im=0]
   */
  addA(row, col, re, im = 0) {
    const idx = row * this.n + col;
    this.Are[idx] += re;
    this.Aim[idx] += im;
  }

  /**
   * @param {number} row
   * @param {number} re
   * @param {number} [im=0]
   */
  addB(row, re, im = 0) {
    this.bre[row] += re;
    this.bim[row] += im;
  }

  /**
   * Solve complex A * x = b using Gaussian elimination with scaled partial pivoting.
   * @returns {boolean}
   */
  solve() {
    const n = this.n;
    if (n === 0) return true;

    const Are = this.Are;
    const Aim = this.Aim;
    const bre = this.bre;
    const bim = this.bim;
    const xre = this.xre;
    const xim = this.xim;
    const piv = this.piv;
    const scale = this.rowScale;

    for (let i = 0; i < n; i++) {
      piv[i] = i;
      let maxMag = 0;
      const off = i * n;
      for (let j = 0; j < n; j++) {
        const mag = Math.hypot(Are[off + j], Aim[off + j]);
        if (mag > maxMag) maxMag = mag;
      }
      if (maxMag < PIVOT_EPS || !Number.isFinite(maxMag)) return false;
      scale[i] = 1 / maxMag;
    }

    for (let k = 0; k < n; k++) {
      let bestRow = k;
      let bestRatio = -1;
      for (let i = k; i < n; i++) {
        const pi = piv[i];
        const idx = pi * n + k;
        const ratio = Math.hypot(Are[idx], Aim[idx]) * scale[pi];
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestRow = i;
        }
      }

      if (bestRow !== k) {
        const tmp = piv[k];
        piv[k] = piv[bestRow];
        piv[bestRow] = tmp;
      }

      const pk = piv[k];
      const pkOff = pk * n;
      const pRe = Are[pkOff + k];
      const pIm = Aim[pkOff + k];
      const pDenom = pRe * pRe + pIm * pIm;
      if (pDenom < PIVOT_EPS * PIVOT_EPS || !Number.isFinite(pDenom)) return false;

      const invDenom = 1 / pDenom;

      for (let i = k + 1; i < n; i++) {
        const pi = piv[i];
        const piOff = pi * n;
        const aRe = Are[piOff + k];
        const aIm = Aim[piOff + k];
        if (aRe === 0 && aIm === 0) continue;

        // factor = (aRe + j aIm) / (pRe + j pIm)
        const fRe = (aRe * pRe + aIm * pIm) * invDenom;
        const fIm = (aIm * pRe - aRe * pIm) * invDenom;

        Are[piOff + k] = 0;
        Aim[piOff + k] = 0;

        for (let j = k + 1; j < n; j++) {
          const bRe = Are[pkOff + j];
          const bIm = Aim[pkOff + j];
          Are[piOff + j] -= fRe * bRe - fIm * bIm;
          Aim[piOff + j] -= fRe * bIm + fIm * bRe;
        }

        const rhsRe = bre[pk];
        const rhsIm = bim[pk];
        bre[pi] -= fRe * rhsRe - fIm * rhsIm;
        bim[pi] -= fRe * rhsIm + fIm * rhsRe;
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      const pi = piv[i];
      const piOff = pi * n;
      let sumRe = bre[pi];
      let sumIm = bim[pi];
      for (let j = i + 1; j < n; j++) {
        const aRe = Are[piOff + j];
        const aIm = Aim[piOff + j];
        sumRe -= aRe * xre[j] - aIm * xim[j];
        sumIm -= aRe * xim[j] + aIm * xre[j];
      }
      const dRe = Are[piOff + i];
      const dIm = Aim[piOff + i];
      const dDenom = dRe * dRe + dIm * dIm;
      if (dDenom < PIVOT_EPS * PIVOT_EPS || !Number.isFinite(dDenom)) return false;
      xre[i] = (sumRe * dRe + sumIm * dIm) / dDenom;
      xim[i] = (sumIm * dRe - sumRe * dIm) / dDenom;
      if (!Number.isFinite(xre[i]) || !Number.isFinite(xim[i])) return false;
    }

    return true;
  }
}
