/**
 * Unit conversions. Internal state is SI; instruments convert at display.
 * Port of gemini-capsule src/core/units.gd.
 */

export const FT_PER_M = 3.280839895013123;
export const NMI_IN_M = 1852.0;
export const LBF_IN_N = 4.4482216152605;
export const LBM_IN_KG = 0.45359237;
export const PSI_IN_PA = 6894.757293168;
export const G0 = 9.80665;
export const INCH_IN_M = 0.0254;

export const Units = {
  m_to_ft: (m: number) => m * FT_PER_M,
  ft_to_m: (ft: number) => ft / FT_PER_M,
  m_to_nmi: (m: number) => m / NMI_IN_M,
  nmi_to_m: (nmi: number) => nmi * NMI_IN_M,
  inch_to_m: (inch: number) => inch * INCH_IN_M,
  n_to_lbf: (n: number) => n / LBF_IN_N,
  lbf_to_n: (lbf: number) => lbf * LBF_IN_N,
  kg_to_lbm: (kg: number) => kg / LBM_IN_KG,
  lbm_to_kg: (lbm: number) => lbm * LBM_IN_KG,
  pa_to_psi: (pa: number) => pa / PSI_IN_PA,
  mps2_to_g: (a: number) => a / G0,
  /** kg/s = thrust / (Isp · g0) */
  mass_flow: (thrust_n: number, isp_s: number) => thrust_n / (isp_s * G0),
  convert(value: number, kind: string): number {
    switch (kind) {
      case "m_to_ft":
        return value * FT_PER_M;
      case "m_to_nmi":
        return value / NMI_IN_M;
      case "mps_to_fps":
        return value * FT_PER_M;
      case "pa_to_psi":
        return value / PSI_IN_PA;
      case "n_to_lbf":
        return value / LBF_IN_N;
      case "kg_to_lbm":
        return value / LBM_IN_KG;
      case "mps2_to_g":
        return value / G0;
      case "rad_to_deg":
        return (value * 180) / Math.PI;
      default:
        return value;
    }
  },
};
