// The figures people have long seen in the stars: for each constellation,
// which stars are joined to which. Stars are named by where they stand (right
// ascension in hours, declination in degrees) and looked up in the star list,
// so a figure can only use stars the sky really draws.

import { starIndex } from './stars';

export interface Figure {
  id: string;
  /** What appears in the sky when the figure is finished. */
  name: string;
  /** Pairs of stars (as places in the star list) joined by a line. */
  lines: [number, number][];
}

type Spot = [number, number];

function figure(id: string, name: string, joins: [Spot, Spot][]): Figure | null {
  const lines: [number, number][] = [];
  for (const [a, b] of joins) {
    const i = starIndex(a[0], a[1]);
    const j = starIndex(b[0], b[1]);
    if (i < 0 || j < 0 || i === j) {
      console.warn(`constellation ${id}: a star is missing from the list`, a, b);
      return null;
    }
    lines.push([i, j]);
  }
  return { id, name, lines };
}

// Orion
const BETELGEUSE: Spot = [5.919, 7.41];
const RIGEL: Spot = [5.242, -8.2];
const BELLATRIX: Spot = [5.419, 6.35];
const MINTAKA: Spot = [5.533, -0.3];
const ALNILAM: Spot = [5.604, -1.2];
const ALNITAK: Spot = [5.679, -1.94];
const SAIPH: Spot = [5.796, -9.67];
const MEISSA: Spot = [5.585, 9.93];
// Taurus and Auriga (which share Elnath)
const ALDEBARAN: Spot = [4.599, 16.51];
const ELNATH: Spot = [5.438, 28.61];
const ZETA_TAU: Spot = [5.627, 21.14];
const AIN: Spot = [4.477, 19.18];
const GAMMA_TAU: Spot = [4.33, 15.63];
const THETA_TAU: Spot = [4.478, 15.87];
const DELTA_TAU: Spot = [4.382, 17.54];
const CAPELLA: Spot = [5.278, 46.0];
const MENKALINAN: Spot = [5.992, 44.95];
const THETA_AUR: Spot = [5.995, 37.21];
const IOTA_AUR: Spot = [4.95, 33.17];
// The dogs and the twins
const SIRIUS: Spot = [6.752, -16.72];
const ADHARA: Spot = [6.977, -28.97];
const WEZEN: Spot = [7.14, -26.39];
const MIRZAM: Spot = [6.378, -17.96];
const ALUDRA: Spot = [7.402, -29.3];
const PROCYON: Spot = [7.655, 5.22];
const GOMEISA: Spot = [7.453, 8.29];
const POLLUX: Spot = [7.755, 28.03];
const CASTOR: Spot = [7.577, 31.89];
const ALHENA: Spot = [6.629, 16.4];
const MU_GEM: Spot = [6.383, 22.51];
const MEBSUTA: Spot = [6.732, 25.13];
// Cassiopeia, Andromeda, Pegasus, Aries
const SCHEDAR: Spot = [0.675, 56.54];
const CAPH: Spot = [0.153, 59.15];
const GAMMA_CAS: Spot = [0.945, 60.72];
const RUCHBAH: Spot = [1.43, 60.24];
const SEGIN: Spot = [1.907, 63.67];
const ALPHERATZ: Spot = [0.14, 29.09];
const MIRACH: Spot = [1.162, 35.62];
const ALMACH: Spot = [2.065, 42.33];
const MARKAB: Spot = [23.079, 15.21];
const SCHEAT: Spot = [23.063, 28.08];
const ALGENIB: Spot = [0.221, 15.18];
const ENIF: Spot = [21.736, 9.88];
const HAMAL: Spot = [2.12, 23.46];
const SHERATAN: Spot = [1.911, 20.81];
// The summer triangle's three
const DENEB: Spot = [20.69, 45.28];
const SADR: Spot = [20.37, 40.26];
const GIENAH_CYG: Spot = [20.77, 33.97];
const DELTA_CYG: Spot = [19.75, 45.13];
const ALBIREO: Spot = [19.512, 27.96];
const VEGA: Spot = [18.616, 38.78];
const SHELIAK: Spot = [18.835, 33.36];
const SULAFAT: Spot = [18.982, 32.69];
const ALTAIR: Spot = [19.846, 8.87];
const TARAZED: Spot = [19.771, 10.61];
const ALSHAIN: Spot = [19.922, 6.41];
const DELTA_AQL: Spot = [19.425, 3.11];
const ZETA_AQL: Spot = [19.09, 13.86];
const LAMBDA_AQL: Spot = [19.104, -4.88];
const THETA_AQL: Spot = [20.188, -0.82];
const ROTANEV: Spot = [20.626, 14.6];
const SUALOCIN: Spot = [20.661, 15.91];
const GAMMA_DEL: Spot = [20.778, 16.12];
const DELTA_DEL: Spot = [20.724, 15.07];
const EPSILON_DEL: Spot = [20.554, 11.3];
// The north
const DUBHE: Spot = [11.062, 61.75];
const MERAK: Spot = [11.031, 56.38];
const PHECDA: Spot = [11.897, 53.69];
const MEGREZ: Spot = [12.257, 57.03];
const ALIOTH: Spot = [12.9, 55.96];
const MIZAR: Spot = [13.399, 54.93];
const ALKAID: Spot = [13.792, 49.31];
const POLARIS: Spot = [2.53, 89.26];
const KOCHAB: Spot = [14.845, 74.16];
const PHERKAD: Spot = [15.345, 71.83];
// Spring and summer evenings
const ARCTURUS: Spot = [14.261, 19.18];
const IZAR: Spot = [14.75, 27.07];
const MUPHRID: Spot = [13.911, 18.4];
const SEGINUS: Spot = [14.535, 38.31];
const NEKKAR: Spot = [15.032, 40.39];
const KORNEPHOROS: Spot = [16.504, 21.49];
const ZETA_HER: Spot = [16.688, 31.6];
const ETA_HER: Spot = [16.715, 38.92];
const PI_HER: Spot = [17.251, 36.81];
const EPSILON_HER: Spot = [17.005, 30.93];
const RASALGETHI: Spot = [17.244, 14.39];
const REGULUS: Spot = [10.139, 11.97];
const DENEBOLA: Spot = [11.818, 14.57];
const ALGIEBA: Spot = [10.333, 19.84];
const ZOSMA: Spot = [11.235, 20.52];
const CHERTAN: Spot = [11.237, 15.43];
const ETA_LEO: Spot = [10.122, 16.76];
const ADHAFERA: Spot = [10.278, 23.42];
const EPSILON_LEO: Spot = [9.764, 23.77];
const MU_LEO: Spot = [9.879, 26.01];
const SPICA: Spot = [13.42, -11.16];
const PORRIMA: Spot = [12.694, -1.45];
const VINDEMIATRIX: Spot = [13.036, 10.96];
// The southern summer sky
const ANTARES: Spot = [16.49, -26.43];
const DSCHUBBA: Spot = [16.006, -22.62];
const ACRAB: Spot = [16.091, -19.81];
const SHAULA: Spot = [17.56, -37.1];
const SARGAS: Spot = [17.622, -43.0];
const EPSILON_SCO: Spot = [16.836, -34.29];
const PI_SCO: Spot = [15.981, -26.11];
const SIGMA_SCO: Spot = [16.353, -25.59];
const TAU_SCO: Spot = [16.598, -28.22];
const KAUS_AUSTRALIS: Spot = [18.403, -34.38];
const NUNKI: Spot = [18.921, -26.3];
const ASCELLA: Spot = [19.044, -29.88];
const KAUS_MEDIA: Spot = [18.35, -29.83];
const KAUS_BOREALIS: Spot = [18.466, -25.42];
const ALNASL: Spot = [18.097, -30.42];
const PHI_SGR: Spot = [18.761, -26.99];
const RASALHAGUE: Spot = [17.582, 12.56];
const SABIK: Spot = [17.173, -15.72];
const CEBALRAI: Spot = [17.725, 4.57];
// Small figures, and the far south
const GIENAH_CRV: Spot = [12.263, -17.54];
const KRAZ: Spot = [12.573, -23.4];
const ALGORAB: Spot = [12.498, -16.52];
const EPSILON_CRV: Spot = [12.169, -22.62];
const ARNEB: Spot = [5.545, -17.82];
const NIHAL: Spot = [5.471, -20.76];
const ACRUX: Spot = [12.443, -63.1];
const MIMOSA: Spot = [12.795, -59.69];
const GACRUX: Spot = [12.519, -57.11];
const DELTA_CRU: Spot = [12.252, -58.75];

const ALL: (Figure | null)[] = [
  figure('orion', 'orion · the hunter', [
    [BETELGEUSE, MEISSA], [MEISSA, BELLATRIX], [BETELGEUSE, ALNITAK], [BELLATRIX, MINTAKA],
    [MINTAKA, ALNILAM], [ALNILAM, ALNITAK], [ALNITAK, SAIPH], [MINTAKA, RIGEL],
  ]),
  figure('taurus', 'taurus · the bull', [
    [GAMMA_TAU, THETA_TAU], [THETA_TAU, ALDEBARAN], [ALDEBARAN, ZETA_TAU], [GAMMA_TAU, DELTA_TAU], [DELTA_TAU, AIN], [AIN, ELNATH],
  ]),
  figure('auriga', 'auriga · the charioteer', [
    [CAPELLA, MENKALINAN], [MENKALINAN, THETA_AUR], [THETA_AUR, ELNATH], [ELNATH, IOTA_AUR], [IOTA_AUR, CAPELLA],
  ]),
  figure('canis-major', 'canis major · the great dog', [[MIRZAM, SIRIUS], [SIRIUS, WEZEN], [WEZEN, ADHARA], [WEZEN, ALUDRA]]),
  figure('canis-minor', 'canis minor · the little dog', [[PROCYON, GOMEISA]]),
  figure('gemini', 'gemini · the twins', [[CASTOR, POLLUX], [CASTOR, MEBSUTA], [MEBSUTA, MU_GEM], [POLLUX, ALHENA]]),
  figure('cassiopeia', 'cassiopeia · the queen', [[CAPH, SCHEDAR], [SCHEDAR, GAMMA_CAS], [GAMMA_CAS, RUCHBAH], [RUCHBAH, SEGIN]]),
  figure('andromeda', 'andromeda · the chained princess', [[ALPHERATZ, MIRACH], [MIRACH, ALMACH]]),
  figure('pegasus', 'pegasus · the winged horse', [
    [ALPHERATZ, SCHEAT], [SCHEAT, MARKAB], [MARKAB, ALGENIB], [ALGENIB, ALPHERATZ], [MARKAB, ENIF],
  ]),
  figure('aries', 'aries · the ram', [[HAMAL, SHERATAN]]),
  figure('cygnus', 'cygnus · the swan', [[DENEB, SADR], [SADR, ALBIREO], [SADR, GIENAH_CYG], [SADR, DELTA_CYG]]),
  figure('lyra', 'lyra · the lyre', [[VEGA, SHELIAK], [SHELIAK, SULAFAT], [SULAFAT, VEGA]]),
  figure('aquila', 'aquila · the eagle', [
    [TARAZED, ALTAIR], [ALTAIR, ALSHAIN], [ALTAIR, DELTA_AQL], [DELTA_AQL, ZETA_AQL], [DELTA_AQL, THETA_AQL], [DELTA_AQL, LAMBDA_AQL],
  ]),
  figure('delphinus', 'delphinus · the dolphin', [
    [SUALOCIN, ROTANEV], [ROTANEV, DELTA_DEL], [DELTA_DEL, GAMMA_DEL], [GAMMA_DEL, SUALOCIN], [ROTANEV, EPSILON_DEL],
  ]),
  figure('ursa-major', 'the plough · in the great bear', [
    [DUBHE, MERAK], [MERAK, PHECDA], [PHECDA, MEGREZ], [MEGREZ, DUBHE], [MEGREZ, ALIOTH], [ALIOTH, MIZAR], [MIZAR, ALKAID],
  ]),
  figure('ursa-minor', 'ursa minor · the little bear', [[POLARIS, KOCHAB], [KOCHAB, PHERKAD]]),
  figure('bootes', 'boötes · the herdsman', [
    [ARCTURUS, IZAR], [IZAR, NEKKAR], [NEKKAR, SEGINUS], [SEGINUS, ARCTURUS], [ARCTURUS, MUPHRID],
  ]),
  figure('hercules', 'hercules · the kneeling hero', [
    [ZETA_HER, ETA_HER], [ETA_HER, PI_HER], [PI_HER, EPSILON_HER], [EPSILON_HER, ZETA_HER], [ZETA_HER, KORNEPHOROS], [EPSILON_HER, RASALGETHI],
  ]),
  figure('leo', 'leo · the lion', [
    [REGULUS, ETA_LEO], [ETA_LEO, ALGIEBA], [ALGIEBA, ADHAFERA], [ADHAFERA, MU_LEO], [MU_LEO, EPSILON_LEO],
    [ALGIEBA, ZOSMA], [ZOSMA, DENEBOLA], [DENEBOLA, CHERTAN], [CHERTAN, REGULUS],
  ]),
  figure('virgo', 'virgo · the maiden', [[SPICA, PORRIMA], [PORRIMA, VINDEMIATRIX]]),
  figure('scorpius', 'scorpius · the scorpion', [
    [ACRAB, DSCHUBBA], [DSCHUBBA, PI_SCO], [DSCHUBBA, SIGMA_SCO], [SIGMA_SCO, ANTARES], [ANTARES, TAU_SCO],
    [TAU_SCO, EPSILON_SCO], [EPSILON_SCO, SARGAS], [SARGAS, SHAULA],
  ]),
  figure('sagittarius', 'sagittarius · the teapot', [
    [ASCELLA, PHI_SGR], [PHI_SGR, KAUS_MEDIA], [KAUS_MEDIA, KAUS_AUSTRALIS], [KAUS_AUSTRALIS, ASCELLA],
    [KAUS_BOREALIS, PHI_SGR], [KAUS_BOREALIS, KAUS_MEDIA], [ALNASL, KAUS_MEDIA], [NUNKI, PHI_SGR],
  ]),
  figure('ophiuchus', 'ophiuchus · the serpent bearer', [[RASALHAGUE, CEBALRAI], [CEBALRAI, SABIK]]),
  figure('corvus', 'corvus · the crow', [[GIENAH_CRV, ALGORAB], [ALGORAB, KRAZ], [KRAZ, EPSILON_CRV], [EPSILON_CRV, GIENAH_CRV]]),
  figure('lepus', 'lepus · the hare', [[ARNEB, NIHAL]]),
  figure('crux', 'crux · the southern cross', [[ACRUX, GACRUX], [MIMOSA, DELTA_CRU]]),
];

export const FIGURES: Figure[] = ALL.filter((f): f is Figure => f !== null);
