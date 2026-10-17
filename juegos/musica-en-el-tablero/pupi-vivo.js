/* El Pupi animado, copiado de la web (prototipos/comentarista/pupi.js) por herramientas/armar-pupi.js. No editar a mano. */
(function () {
  "use strict";
  var VIVO_W = 341, VIVO_H = 308;
  var VIVO_BORDES = {"horror":{"x0":156,"top":[217.7,216.7,215.3,213.7,212.7,211.7,211,210.3,209.7,209.3,209,209,209,209.3,210,211,211.8,212.3],"bot":[231.6,232.2,234,235.8,237.4,238.8,240,240,240,240,239.8,239.4,237.4,235,232.2,229.4,226.8,225.8]},"triste":{"x0":141,"top":[216,213,211,209,208,207,206,205,204,203,202,202,201,200,200,199,199,198,198,198,198,197,197,197,197,196,196,196,196,196,196,196,196,196,196,196,197,197,197,197,198,198,199,199,200,201,202,203,204,206,207,210],"bot":[229,231,232,233,234,234,234,234,233,232,232,231,230,228,227,226,224,223,222,221,220,220,219,218,218,218,217,217,217,217,217,217,217,217,217,217,218,218,219,219,220,221,221,222,222,222,222,221,220,219,217,214]},"asombro":{"x0":104,"top":[197,197,197,197,198,199,200,200.3,200.7,201,201,201,201,201,201,201,201,201,201,201,201,201,201,201,200.7,200.3,200,200,200,200,200,199.7,199.3,199,199,199,198.7,198.3,198,198,198,197.7,197.3,197,197,197,197,197,197,197,197,197,197,197],"bot":[222.7,224,225.7,227.8,230,231.8,233.4,234.8,236,237.2,238.4,239.4,240.4,241.4,242,242.6,243.4,244,244.4,245,245.4,245.6,245.8,246,246.2,246.4,246.6,246.8,247,246.8,246.6,247.2,247.8,248.4,249.2,249,247.8,246.6,245.2,243.6,243,242.4,241.6,240.8,239.8,238.6,237.2,235.8,234.2,232.6,231.2,232,233,234.4]},"bostezo":{"x0":152,"top":[225,223.5,221.3,219.3,217.7,216.3,214.7,213.3,212,211.3,210.7,210,209.3,208.7,208.3,207.7,207.3,207,207,207,207,207,207,207.3,207.7,208],"bot":[251.5,252.6,253.9,255.4,256.8,257.8,258.6,259.2,259.8,260.2,260.6,260.8,261,261,261,261,261,261,261,261,261.2,261.4,261.6,260.3,259,257.5]}};
  var VIVO_CARAS = {
    habla:      { nombre: 'De siempre', ojoL: [125.5, 180, 20.5, 15.5], ojoR: [190.5, 170, 16.5, 16], pupL: [132, 177, 11], pupR: [186, 169, 10], piel: [0.969, 0.755, 0.592],
                  boca: [143, 220, 180, 218], bocaF: [10, 7, 0.45], cuello: [165, 272] },
    ceba:       { nombre: 'Ceba (datos)', ojoL: [192.5, 173, 17.5, 14], ojoR: [252, 182.5, 14, 12.5], pupL: [199.3, 179.1, 10], pupR: [244.2, 186.2, 10], piel: [0.988, 0.759, 0.596], pupM: 3.5,
                  boca: [205, 220, 226, 220], bocaF: [0.6, 4.5, 1], cuello: [222, 268], cabX: 168, extra: 1 },
    explica:    { nombre: 'Explica', pielBoca: [0.984, 0.729, 0.547], ojoL: [109.5, 179, 20.5, 18], ojoR: [174, 166, 18, 18], pupL: [115.8, 177.4, 11.5], pupR: [170, 167.1, 11.5], piel: [0.992, 0.745, 0.557], pupM: 3.5, abierta: 1, bordes: {"x0": 125, "top": [220.1, 219.8, 219.7, 219.6, 219.2, 219.0, 218.4, 217.6, 216.6, 216.0, 215.4, 215.2, 214.8, 214.6, 214.4, 214.0, 213.6, 213.4, 213.2, 213.0, 212.8, 212.6, 212.4, 212.2, 211.8, 211.6, 211.4, 211.2, 210.8, 210.6, 210.4, 210.0, 209.6, 209.4, 209.0, 208.6, 208.4, 208.2, 208.0, 208.0, 208.0], "bot": [229.2, 229.9, 230.7, 231.7, 232.7, 233.9, 234.9, 235.8, 236.6, 237.2, 237.9, 238.4, 238.9, 239.2, 239.4, 239.7, 239.8, 239.9, 240.0, 239.9, 239.8, 239.7, 239.4, 239.2, 238.9, 238.6, 238.1, 237.6, 237.0, 236.3, 235.6, 234.8, 233.9, 232.9, 231.7, 230.2, 228.7, 227.3, 226.1, 224.9, 223.8]}, cuello: [150, 275], extra: 3, mano: [216, 150, 262, 296], manoPiv: [250, 300] },
    contento:   { nombre: 'Contento', abierta: 1, pielBoca: [0.992, 0.725, 0.549], bordes: {"x0": 131, "top": [196.3, 196.0, 195.7, 195.4, 195.4, 195.4, 195.6, 195.8, 196.2, 196.4, 196.6, 196.8, 197.2, 197.4, 197.6, 197.8, 198.0, 198.2, 198.4, 198.6, 198.8, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 199.0, 198.8, 198.6, 198.4, 198.2, 198.0, 198.0, 197.8, 197.6, 197.4, 197.0, 196.6, 196.4, 196.0, 195.6, 195.4, 195.2, 195.2, 195.4, 195.6], "bot": [211.5, 212.4, 213.6, 214.9, 216.3, 217.8, 219.2, 220.6, 221.8, 222.9, 223.9, 224.8, 225.7, 226.4, 227.2, 227.9, 228.6, 229.1, 229.6, 230.1, 230.6, 230.9, 231.2, 231.4, 231.7, 231.8, 231.9, 232.0, 232.0, 232.0, 232.0, 232.0, 232.0, 232.0, 231.9, 231.8, 231.6, 231.3, 231.1, 230.8, 230.3, 229.8, 229.2, 228.7, 228.0, 227.3, 226.6, 225.7, 224.7, 223.7, 222.6, 221.2, 219.8, 218.2, 216.3, 214.3, 212.3, 210.6, 209.0, 207.6]}, cuello: [150, 270], risa: true },
    preocupado: { nombre: 'Preocupado', ojoL: [126.5, 173.5, 20.5, 17.5], ojoR: [192.5, 161, 17.5, 17], pupL: [134.1, 172.2, 11.5], pupR: [187.5, 161.5, 11.5], piel: [0.988, 0.753, 0.565], pupM: 3.5,
                  boca: [153, 221, 182, 216], bocaF: [-7.5, 5, 1], cuello: [150, 272], extra: 2, gota: [218, 111, 240, 146] },
    tranqui:    { nombre: 'Tranqui (mate)', cuello: [130, 270], mudo: true },
    escupe:     { nombre: 'Escupe', ojoL: [84.5, 179, 22.5, 22], ojoR: [148.5, 164.5, 19.5, 21.5], pupL: [98.1, 182.4, 9], pupR: [140.8, 174, 8.5], pupM: 3.5,
                  piel: [0.99, 0.75, 0.56], cuello: [110, 272], mudo: true, escupe: [128, 219], despues: ['vida', 'triste'] },
    vida:       { nombre: 'Vida (no entiende)', ojoL: [139.5, 183, 24.5, 23], ojoR: [205.5, 163.5, 21.5, 22.5], pupL: [155.7, 190.9, 15], pupR: [220.5, 172.3, 13.5], pupM: 3.5,
                  piel: [0.99, 0.75, 0.56], cuello: [150, 272], mudo: true,
                  marcas: [{ caja: [274, 118, 308, 170], tipo: 'gira' }, { caja: [18, 218, 60, 268], tipo: 'gira' }] },
    horror:     { nombre: 'Horror', cierre: 0.62, ojoL: [125.5, 178.5, 20.5, 20.5], ojoR: [190, 165, 18, 20], pupL: [136.4, 180.3, 10], pupR: [183.5, 169, 10], pupM: 3.5,
                  piel: [0.99, 0.75, 0.56], abierta: 1, pielBoca: [0.99, 0.75, 0.56], bordes: VIVO_BORDES.horror, cuello: [150, 272],
                  marcas: [{ caja: [238, 88, 282, 150], tipo: 'tiembla' }] },
    ceja:       { nombre: 'Ceja', ojoL: [131.5, 185, 17.5, 12], ojoR: [197.5, 171.5, 15.5, 12.5], pupL: [141.8, 180.1, 9.5], pupR: [195.9, 166.5, 12],
                  piel: [0.975, 0.755, 0.59], boca: [169, 237, 192, 230], bocaF: [-6, 4.5, 1], cuello: [160, 272] },
    atraganta:  { nombre: 'Se atraganta', cuello: [140, 272], mudo: true, tos: [128, 212, 46], sonido: 'tos',
                  marcas: [{ caja: [2, 185, 34, 250], tipo: 'tiembla' }, { caja: [204, 196, 238, 242], tipo: 'tiembla' }, { caja: [236, 150, 266, 188], tipo: 'gira' }] },
    dormido:    { nombre: 'Dormido', cuello: [170, 275], mudo: true, burbuja: [193, 209],
                  marcas: [{ caja: [262, 2, 336, 106], tipo: 'gira' }] },
    bostezo:    { nombre: 'Bostezo', cuello: [160, 275], mudo: true, bostezo: true, partes: [{ caja: [180, 230, 228, 300], piv: [0, 0], mov: 'palmea' }], abierta: 1, pielBoca: [0.973, 0.741, 0.578], bordes: VIVO_BORDES.bostezo },
    asombro:    { nombre: 'Asombro', cuello: [150, 272], abierta: 1, pielBoca: [0.996, 0.796, 0.624], bordes: VIVO_BORDES.asombro,
                  marcas: [{ caja: [246, 62, 292, 136], tipo: 'gira' }, { caja: [228, 138, 300, 198], tipo: 'gira' }, { caja: [297, 210, 340, 260], tipo: 'gira' }] },
    uff:        { nombre: 'Uff', ojoL: [67, 181, 23, 20], ojoR: [132.5, 164.5, 20.5, 18.5], pupL: [77.3, 190.3, 10], pupR: [128.8, 176.4, 10], pupM: 3.5,
                  piel: [0.99, 0.75, 0.56], cuello: [110, 272], mudo: true,
                  uff: true },
    suplica:    { nombre: 'Súplica', ojoL: [111.0, 178.5, 29.0, 27.5], ojoR: [180.0, 172.0, 22.0, 27.0], pupL: [110.2, 180.7, 12], pupR: [175.2, 175.3, 12], pupM: 3.5, piel: [0.988, 0.761, 0.6], boca: [140, 233, 162, 231], bocaF: [-6.5, 4.5, 1], cuello: [150, 272], ruego: true, sinMirada: true },
    guino:      { nombre: 'Guiño', cuello: [150, 272], risa: true, abierta: 1, pielBoca: [0.98, 0.753, 0.6], bordes: {"x0": 108, "top": [210.0, 209.5, 209.0, 208.2, 207.3, 206.5, 206.5, 206.5, 206.5, 206.8, 207.2, 207.5, 207.8, 208.2, 208.5, 208.8, 209.2, 209.5, 209.5, 209.5, 209.5, 209.8, 210.2, 210.5, 210.5, 210.5, 210.5, 210.5, 210.5, 210.5, 210.7, 210.8, 211.0, 211.2, 211.3, 211.5, 211.5, 211.5, 211.5, 211.5, 211.5, 211.5, 211.2, 210.8, 210.5, 210.5, 210.5, 210.5, 210.5, 210.5, 210.5, 210.8, 211.2, 211.5, 211.8, 212.0], "bot": [210.5, 211.2, 212.0, 214.7, 217.3, 220.0, 221.7, 223.3, 225.0, 226.0, 227.0, 228.0, 229.0, 230.0, 231.0, 231.7, 232.3, 233.0, 233.3, 233.7, 234.0, 234.3, 234.7, 235.0, 235.2, 235.3, 235.5, 235.7, 235.8, 236.0, 235.8, 235.7, 235.5, 235.3, 235.2, 235.0, 234.7, 234.3, 234.0, 233.3, 232.7, 232.0, 231.0, 230.0, 229.0, 228.0, 227.0, 226.0, 224.3, 222.7, 221.0, 218.8, 216.7, 214.5, 213.5, 212.5]} },
    despierta:  { nombre: 'Se despierta', cuello: [150, 272], mudo: true, partes: [{ caja: [210, 170, 262, 230], piv: [252, 246], mov: 'frota' }],
                  marcas: [{ caja: [262, 82, 322, 140], tipo: 'gira' }, { caja: [240, 135, 268, 168], tipo: 'gira' }, { caja: [266, 163, 296, 194], tipo: 'tiembla' }] },
    malhumor:   { nombre: 'Malhumor', sinParpadeo: true, sinMirada: true, ojoL: [112.5, 179.5, 13.5, 11.5], ojoR: [183.5, 176.5, 10.5, 11.5], pupL: [121.1, 180.7, 7.5], pupR: [177.1, 176.6, 7.5], pupM: 3.5, piel: [0.988, 0.761, 0.6], cuello: [150, 272], bronca: true, abierta: 1, pielBoca: [0.988, 0.757, 0.596], bordes: {"x0": 131, "top": [null, null, 226.0, 224.0, 223.0, 221.0, 220.0, 219.0, 219.0, 218.0, 217.0, 217.0, 217.0, 216.0, 216.0, 216.0, 215.0, 215.0, 215.0, 215.0, 215.0, 215.0, 216.0, 216.0, 216.0, 216.0, 216.0, 216.0, 217.0, 217.0, 217.0, 218.0, 219.0, 220.0, 222.0, 224.0, null, null], "bot": [null, null, 232.0, 233.0, 233.0, 233.0, 233.0, 232.0, 232.0, 232.0, 232.0, 232.0, 231.0, 231.0, 231.0, 231.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 230.0, 231.0, 231.0, 231.0, 230.0, null, null]}, partes: [{ caja: [128, 216, 174, 240], piv: [151, 228], mov: 'tiembla' }],
                  marcas: [{ caja: [230, 40, 304, 110], tipo: 'tiembla' }] },
    gracias:    { nombre: 'Gracias', cuello: [150, 272], mudo: true, marcas: [{ caja: [240, 124, 298, 184], tipo: 'late' }] },
    chau:       { nombre: 'Chau', piel: [0.988, 0.737, 0.569], boca: [129, 210, 172, 210], bocaF: [8, 6, 0.45], cuello: [150, 272], manoMask: 'chau_m', manoPiv: [256, 262] },
    nocomio:    { nombre: 'No se la comió', cierre: 0.62, ojoL: [138.5, 178.5, 22.5, 20.5], ojoR: [203.5, 163.0, 19.5, 20.0], pupL: [149.7, 178.1, 11.5], pupR: [196.1, 166.8, 11.5], pupM: 3.5, piel: [0.992, 0.733, 0.549], cuello: [150, 272], abierta: 1, pielBoca: [0.988, 0.737, 0.565], bordes: {"x0": 169, "top": [216.3, 214.3, 211.7, 209.0, 207.7, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.3, 208.7, 211.0, 213.0], "bot": [237.4, 238.8, 240.4, 242.2, 243.6, 244.4, 245.0, 245.4, 245.6, 245.8, 246.0, 246.6, 247.2, 247.8, 248.4, 249.0, 249.0, 247.0, 244.8, 242.0, 238.4, 234.0, 231.6, 229.4]},
                  marcas: [{ caja: [261, 56, 303, 106], tipo: 'titila' }, { caja: [249, 137, 290, 200], tipo: 'titila' }, { caja: [12, 197, 43, 246], tipo: 'titila' }] },
    resignado:  { nombre: 'Resignado', piel: [0.996, 0.757, 0.573], boca: [152, 224, 180, 216], bocaF: [1.5, 4.5, 1], cuello: [150, 272], suspira: true },
    miravos:    { nombre: 'Mirá vos', sinParpadeo: true, sinMirada: true, ojoL: [125.5, 185.0, 15.5, 11.0], ojoR: [195.5, 173.0, 17.5, 13.0], pupL: [134.5, 185.3, 6.5], pupR: [192.1, 172.2, 11.5], pupM: 3.5, piel: [0.992, 0.745, 0.573], boca: [164, 229, 185, 222], bocaF: [-1, 4.5, 1], cuello: [150, 272] },
    dale:       { nombre: 'Dale', ojoL: [155.5, 178.0, 21.5, 18.0], ojoR: [221.0, 169.0, 18.0, 18.0], pupL: [160.3, 176.3, 10.0], pupR: [214.7, 168.8, 10.0], pupM: 3.5, piel: [0.984, 0.733, 0.565], cuello: [160, 272], risa: true, abierta: 1, pielBoca: [0.984, 0.749, 0.584], bordes: {"x0": 152, "top": [207.3, 206.8, 206.3, 206.0, 206.0, 206.0, 206.0, 206.0, 206.0, 206.0, 206.0, 206.0, 206.3, 206.7, 207.0, 207.3, 207.7, 208.0, 208.0, 208.0, 208.0, 208.0, 208.3, 208.7, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 209.0, 208.7, 208.3, 208.0, 208.0, 208.0, 208.0, 208.0, 208.0, 207.7, 207.3, 207.0, 207.0, 206.7, 206.3, 206.0, 206.0, 206.0, 206.0, 206.0], "bot": [220.5, 221.6, 223.1, 225.0, 226.8, 228.6, 230.2, 231.6, 232.8, 234.0, 235.0, 236.0, 237.0, 237.8, 238.6, 239.4, 240.0, 240.6, 241.2, 241.8, 242.2, 242.6, 243.0, 243.4, 243.6, 243.8, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 244.0, 243.8, 243.6, 243.4, 243.0, 242.6, 242.2, 241.8, 241.2, 240.6, 240.0, 239.4, 238.6, 237.8, 237.0, 236.0, 235.0, 234.0, 232.8, 231.6, 230.2, 228.6, 226.6]},
                  gotaDib: [261, 146, 7],
                  marcas: [{ caja: [2, 148, 58, 252], tipo: 'tiembla' }, { caja: [282, 86, 338, 192], tipo: 'tiembla' }] },
    ofendido:   { nombre: 'Ofendido', sinParpadeo: true, sinMirada: true, ojoL: [117.0, 181.0, 15.0, 12.0], ojoR: [190.5, 173.5, 10.5, 12.5], pupL: [126.9, 181.6, 7.5], pupR: [184.1, 173.7, 8.5], pupM: 3.5, piel: [0.988, 0.761, 0.6], boca: [139, 219, 175, 217], bocaF: [9, 5, 0.45], cuello: [150, 272] },
    concentrado:{ nombre: 'Concentrado', sinParpadeo: true, sinMirada: true, ojoL: [126.0, 176.0, 20.0, 14.0], ojoR: [191.5, 170.5, 17.5, 13.5], pupL: [134.2, 175.3, 11.0], pupR: [188.4, 170.0, 10.5], pupM: 3.5, piel: [0.992, 0.745, 0.565], boca: [152, 226, 175, 224], bocaF: [-6.5, 4.5, 1], cuello: [150, 272] },
    analiza:    { nombre: 'Analiza', piel: [0.988, 0.745, 0.569], boca: [147, 221, 175, 219], bocaF: [1.5, 6.5, 1], cuello: [150, 230] },
    preocupado2:{ nombre: 'Preocupado 2', ojoL: [134.5, 180.5, 17.5, 14.5], ojoR: [208.0, 165.5, 17.0, 15.5], pupL: [146.0, 180.2, 12], pupR: [204.4, 168.9, 12.0], pupM: 3.5, piel: [0.996, 0.753, 0.573], boca: [166, 229, 191, 223], bocaF: [-6, 4.5, 1], cuello: [150, 272], extra: 2, gota: [228, 112, 248, 150] },
    contento2:  { nombre: 'Contento 2', cierre: 0.62, ojoL: [134.0, 180.0, 21.0, 19.0], ojoR: [200.5, 165.5, 17.5, 18.5], pupL: [144.0, 180.7, 12.0], pupR: [195.0, 168.4, 11.5], pupM: 3.5, piel: [0.992, 0.737, 0.553], cuello: [150, 272], abierta: 1, pielBoca: [0.996, 0.729, 0.567], bordes: {"x0": 164, "top": [223.0, 221.0, 218.0, 215.3, 213.0, 211.0, 209.3, 208.3, 207.7, 207.3, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.0, 207.3, 208.0, 209.3, 211.3, 214.3, 218.0], "bot": [239.1, 240.4, 242.1, 243.8, 245.2, 246.2, 247.0, 247.4, 247.8, 248.0, 248.0, 248.0, 247.8, 247.6, 247.2, 246.8, 247.0, 247.4, 247.8, 246.6, 244.8, 241.7, 237.9]},
                  marcas: [{ caja: [254, 60, 290, 104], tipo: 'titila' }, { caja: [250, 148, 290, 206], tipo: 'titila' }, { caja: [4, 98, 50, 146], tipo: 'titila' }, { caja: [8, 200, 40, 252], tipo: 'titila' }] },
    contento3:  { nombre: 'Canchero (chasquido)', piel: [0.984, 0.737, 0.545], boca: [142, 200, 177, 200], bocaF: [5, 5.5, 0.45], cuello: [150, 272],
                  manoMask: 'c3_m', manoPiv: [270, 294], manoMov: 'chasquido', manoRelleno: [262, 250],
                  marcas: [{ caja: [260, 126, 320, 174], tipo: 'pop' }, { caja: [0, 106, 34, 158], tipo: 'titila' }] },
    horror2:    { nombre: 'Horror 2 (no puede ser)', cuello: [150, 272], mudo: true, niega: true },
    triste:     { nombre: 'Triste', ojoL: [124, 166.5, 21, 16.5], ojoR: [195, 151.5, 18, 17.5], pupL: [133.2, 167.5, 11.5], pupR: [189.6, 155.8, 11], pupM: 3.5,
                  piel: [0.99, 0.75, 0.56], abierta: 1, pielBoca: [0.99, 0.75, 0.56], bordes: VIVO_BORDES.triste, cuello: [150, 272],
                  agua: [[92, 168, 158, 266], [188, 158, 224, 266]] },
  };
  // Las caras que todavía no tienen medidas (ofendido2…): sólo respiran y mueven la cabeza.
  var VIVO_SIN_MEDIDAS = { cuello: [150, 272], mudo: true };
  // máscara → archivo de assets/pupi/mascaras/
  var VIVO_MASC = { escupe_m: 'escupe-mascara', escupe_d: 'escupe-debajo', uff_m: 'uff-mascara', chau_m: 'chau-mano', c3_m: 'contento3-mano' };
  function urlMascara(n) { return '/assets/pupi/mascaras/' + n + '.png'; }
  function mascarasDe(c) {
    var m = [];
    if (c.escupe) m.push('escupe_m', 'escupe_d');
    if (c.uff) m.push('uff_m');
    if (c.manoMask) m.push(c.manoMask);
    return m;
  }
  var REDUCIDO = false;
  try { REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function crearVivo() {
    var W = VIVO_W, H = VIVO_H, CARAS = VIVO_CARAS;
    var cv = document.createElement('canvas'), gl = null;
    cv.setAttribute('aria-hidden', 'true');
    try { gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: true }); } catch (e) { gl = null; }
    if (!gl) return null;
    var ESC = 1;
    cv.width = W * ESC; cv.height = H * ESC;
    var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }';
    var FS = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uSize; uniform float uEsc;
uniform vec3 uHead; uniform float uBreath; uniform vec2 uSquash;
uniform float uBlink; uniform vec2 uLook; uniform float uMouth;
uniform vec4 uEyeL, uEyeR; uniform vec3 uPupL, uPupR; uniform vec4 uMP; uniform vec3 uMQ; uniform float uTiene;
uniform float uBocaTipo; uniform vec4 uMA; uniform float uMAa; uniform float uHabla; uniform float uT;
uniform vec2 uCuello; uniform float uCabX; uniform float uExtra; uniform float uGota; uniform float uMano; uniform vec3 uPiel; uniform float uMarco; uniform float uPupM; uniform sampler2D uBordes; uniform vec2 uBX; uniform vec3 uPielBoca; uniform float uCierre;
uniform sampler2D uHandM; uniform float uHM; uniform vec2 uHandF; uniform vec3 uHandR; uniform vec4 uGotaD; uniform sampler2D uGafas; uniform float uTieneG; uniform vec4 uGotaR; uniform vec4 uManoR; uniform vec2 uManoPiv;
uniform vec4 uMk0, uMk1, uMk2, uMk3; uniform vec4 uMkA0, uMkA1, uMkA2, uMkA3;
uniform vec4 uPt0, uPt1; uniform vec2 uPv0, uPv1; uniform vec3 uPa0, uPa1;
uniform vec4 uAg0, uAg1;
uniform vec4 uScup; uniform vec2 uScupO; uniform sampler2D uEMask, uEDeb;
uniform vec4 uInfla; uniform vec4 uBurb; uniform vec2 uPop;
uniform vec4 uVuela; uniform float uLineas; uniform float uUff; uniform vec2 uManoT; uniform sampler2D uUffM;
const vec3 SKIN = vec3(1.0, 0.765, 0.58);
const vec3 INK = vec3(0.33, 0.12, 0.04);
const vec3 LASH = vec3(0.17, 0.10, 0.07);

vec4 tex(vec2 p){ vec2 uv = p / uSize; if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.); return texture2D(uTex, uv); }
float lum(vec3 c){ return dot(c, vec3(.3,.59,.11)); }

bool esPiel(vec3 c){ return c.r > 0.86 && c.g > 0.60 && c.g < 0.84 && c.b > 0.40 && c.b < 0.70; }
float aa(float d, float w){ return 1.0 - smoothstep(w - 0.6, w + 0.6, d); }

vec4 ojo(vec4 col, vec2 p, vec4 e, vec3 pup){
  vec2 q = (p - e.xy) / e.zw; float r2 = dot(q, q);
  vec2 qg = (p - e.xy) / (e.zw + (uMarco > 0.5 ? uMarco + 4.0 : 7.5)); float rg = dot(qg, qg);
  if (rg > 1.0) return col;
  vec4 orig = col;
  float fuera = (sqrt(r2) - 1.0) * min(e.z, e.w);
  bool marco = lum(orig.rgb) < 0.48 && distance(p, pup.xy) > pup.z + uPupM && (fuera > uMarco || (r2 > 1.0 && uMarco < 0.5) || (r2 > 0.8 && distance(p, pup.xy) > pup.z + 5.0 + uMarco * 3.0));
  if (marco) return col;
  // la mirada: mover sólo la pupila (con su brillito)
  if (dot(uLook, uLook) > 0.01) {
    float d0 = distance(p, pup.xy), d1 = distance(p - uLook, pup.xy);
    vec4 s = tex(p - uLook);
    if (r2 > 1.05) {} else if (d1 < pup.z - 0.5 || (d1 < pup.z + 1.5 && lum(s.rgb) < 0.6)) col = s;
    else if (r2 < 1.05 && d0 < pup.z + 4.5 && !esPiel(orig.rgb) && lum(orig.rgb) < 0.9) { vec4 s2 = tex(pup.xy + normalize(p - pup.xy + 0.001) * (pup.z + 3.5)); col = lum(s2.rgb) > 0.82 ? s2 : vec4(0.95, 0.94, 0.93, 1.0); }
  }
  if (uBlink > 0.02) {
    float b = uBlink;
    float arco = 1.0 - q.x * q.x;
    float cerrado = e.y + e.w * 0.05 + e.w * 0.42 * arco;     // donde queda la rayita del ojo cerrado
    float arriba = mix(e.y - e.w - 3.0, cerrado, b);
    float abajo = mix(e.y + e.w + 3.0, cerrado, smoothstep(0.55, 1.0, b));
    vec3 piel = uPiel;
    // la piel de alrededor del ojo, para que el párpado no parezca un parche
    float mg = uMarco > 0.5 ? uMarco + 5.0 : 9.0;
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int i = 0; i < 8; i++) {
      float an = float(i) * 0.785398;
      vec2 d = vec2(cos(an), sin(an));
      vec4 s = tex(e.xy + d * (e.zw + mg));
      float wi = max(0.0, dot(d, normalize(q + 0.0001)) + 0.6);
      if (esPiel(s.rgb)) { acc += s.rgb * wi; wsum += wi; }
    }
    if (wsum > 0.05) piel = mix(piel, acc / wsum, 0.85);
    bool marcoFino = fuera > uMarco + 0.5 && uMarco > 0.5 && lum(orig.rgb) < 0.72;
    if ((p.y < arriba || p.y > abajo) && !marcoFino) {
      float sombra = p.y < arriba ? smoothstep(arriba - 7.0, arriba, p.y) * 0.09 : 0.0;
      col = mix(vec4(piel * (1.0 - sombra), 1.0), orig, smoothstep(0.88, 1.0, rg));
    }
    // la rayita de las pestañas, sólo a lo ancho del ojo
    float ancho = sqrt(max(0.0, 1.0 - pow((arriba - e.y) / e.w, 2.0)));
    float grosor = (0.8 + 1.1 * b) * (0.55 + 0.45 * sqrt(max(0.0, 1.0 - q.x * q.x)));
    float k = aa(abs(p.y - arriba), grosor) * smoothstep(1.0, 0.85, abs(q.x) / max(ancho, 0.3)) * smoothstep(0.05, 0.25, b);
    col = mix(col, vec4(LASH, 1.0), k);
  }
  return col;
}

vec4 boca(vec4 col, vec2 p){
  if (uMouth < 0.02) return col;
  float t = (p.x - uMP.x) / (uMP.z - uMP.x);
  if (t < -0.1 || t > 1.1) return col;
  float tc = clamp(t, 0.0, 1.0);
  float arco = 4.0 * tc * (1.0 - tc);
  float yc = mix(uMP.y, uMP.w, tc);
  float m = uMouth, sag = uMQ.x;
  float yu = yc + sag * uMQ.z * arco - m * 1.2 * arco;     // labio de arriba: sigue la línea dibujada
  float yl = yc + sag * arco + m * uMQ.y * pow(arco, 0.75); // labio de abajo: baja
  float g = 1.5;
  float dentro = step(yu, p.y) * step(p.y, yl) * step(0.0, t) * step(t, 1.0);
  float dBorde = min(abs(p.y - yu), abs(p.y - yl));
  if (t < 0.0 || t > 1.0) dBorde = max(dBorde, abs(t < 0.0 ? t : t - 1.0) * (uMP.z - uMP.x));
  vec4 o = col;
  if (dentro > 0.5) {
    float h = (p.y - yu) / max(yl - yu, 0.001);
    vec3 fondo = mix(vec3(0.33, 0.07, 0.05), vec3(0.47, 0.11, 0.08), h);
    vec2 lq = vec2((tc - 0.5) / 0.28, (p.y - yl) / max((yl - yu) * 0.6, 0.8));
    fondo = mix(fondo, vec3(0.88, 0.42, 0.38), smoothstep(1.0, 0.7, dot(lq, lq)));
    o = vec4(fondo, 1.0);
  }
  float borde = aa(dBorde, g * (0.8 + 0.3 * arco)) * smoothstep(0.0, 0.15, m) * step(min(abs(p.y-yu),abs(p.y-yl)), 6.0);
  if (dentro > 0.5 || borde > 0.0) o = mix(o, vec4(INK, 1.0), borde);
  return o;
}

// boca que ya está abierta en el dibujo: se cierra un poco subiendo el labio de abajo
// boca abierta en el dibujo: al hablar los labios se juntan sobre una curva de sonrisa
// devuelve: xy = de dónde leer, z = 1 si ahí va piel, w = cuánto dibujar la rayita de labios juntos
vec4 bocaAbierta(vec2 p){
  float c = uHabla * (1.0 - clamp(uMouth, 0.0, 1.0)) * uCierre;
  if (c < 0.01) return vec4(p, 0.0, 0.0);
  float u = (p.x - uBX.x + 0.5) / uBX.y;
  float fuera = u < 0.0 ? -u * uBX.y : (u > 1.0 ? (u - 1.0) * uBX.y : 0.0);
  if (fuera > 4.5) return vec4(p, 0.0, 0.0);
  vec4 e = texture2D(uBordes, vec2(clamp(u, 0.001, 0.999), 0.5));
  float yT = e.r * 255.0 + 150.0, yB = e.g * 255.0 + 150.0;
  float alto = yB - yT;
  // las comisuras: lo que queda del dibujo justo en las puntas se tapa con piel
  if (fuera > 0.0 || alto < 2.0) {
    if (c > 0.35 && uCierre > 0.99 && p.y >= yT - 3.0 && p.y <= yB + 3.0) return vec4(p, 1.0, 0.0);
    return vec4(p, 0.0, 0.0);
  }
  float yM = yT + alto * 0.42;                  // donde se encuentran los labios
  float nT = mix(yT, yM - 1.2, c), nB = mix(yB, yM + 1.2, c);
  float fin = smoothstep(0.0, 0.12, min(u, 1.0 - u));
  float linea = c * c * (1.0 - smoothstep(0.5 + 0.6 * fin, 1.4 + 0.6 * fin, abs(p.y - yM))) * smoothstep(0.0, 0.05, min(u, 1.0 - u));
  if (p.y >= nT && p.y <= nB) return vec4(p.x, yT + (p.y - nT) * alto / max(nB - nT, 0.3), 0.0, linea);
  if (p.y >= yT - 1.5 && p.y <= yB + 2.5) return vec4(p, 1.0, linea);
  return vec4(p, 0.0, 0.0);
}

// distancia de un punto a la curva del chorro del termo (cebar)
float dChorro(vec2 p, out float s){
  vec2 P[6]; P[0]=vec2(171.,227.); P[1]=vec2(184.,236.); P[2]=vec2(192.,249.); P[3]=vec2(197.,264.); P[4]=vec2(201.,279.); P[5]=vec2(205.,293.);
  float best = 1e3; s = 0.0; float acc = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 a = P[i], b = P[i+1], ab = b - a; float L = length(ab);
    float h = clamp(dot(p - a, ab) / (L * L), 0.0, 1.0);
    float d = distance(p, a + ab * h);
    if (d < best) { best = d; s = acc + h * L; }
    acc += L;
  }
  return best;
}

vec4 cebar(vec4 col, vec2 p){
  float s; float d = dChorro(p, s);
  // el agua corre: brillos que bajan por el chorro
  if (d < 4.5) {
    vec3 c = col.rgb;
    bool agua = lum(c) > 0.5 && c.b > c.r - 0.06;
    if (agua) {
      float ola = sin(s * 0.55 - uT * 16.0) * 0.5 + 0.5;
      float brillo = pow(ola, 3.0) * (1.0 - smoothstep(0.5, 2.5, d));
      c = mix(c * 0.9, vec3(1.0), brillo * 0.75);
      c = mix(c, vec3(0.80, 0.90, 1.0), 0.18);
      return vec4(c, col.a);
    }
  }
  // salpicadura donde cae el agua
  vec2 cae = vec2(206.0, 291.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = fract(uT * 1.6 + fi * 0.37);
    vec2 g = cae + vec2((fi - 1.0) * 4.5 * ph, -9.0 * ph * (1.0 - ph) * 4.0 * 0.6);
    float r = 1.3 * (1.0 - ph * 0.5);
    float k = aa(distance(p, g), r) * (1.0 - smoothstep(0.6, 1.0, ph));
    col = mix(col, vec4(0.88, 0.95, 1.0, 1.0), k * 0.9);
  }
  return col;
}

// el vapor del mate se ondula
vec2 vapor(vec2 p){
  if (p.x < 203.0 || p.x > 228.0 || p.y < 246.0 || p.y > 290.0) return p;
  float s; if (dChorro(p, s) < 6.0) return p;
  float alto = (290.0 - p.y) / 44.0;
  float bx = smoothstep(203.0, 207.0, p.x) * (1.0 - smoothstep(224.0, 228.0, p.x));
  return p + vec2(sin(p.y * 0.28 + uT * 3.2) * 1.8 * alto * bx, 1.2 * alto * bx * sin(uT * 1.3));
}

// la gota de sudor se estira como si fuera a caer
vec4 gota(vec4 col, vec2 p){
  vec2 anc = vec2((uGotaR.x + uGotaR.z) * 0.5, uGotaR.y);
  if (p.x < uGotaR.x - 4.0 || p.x > uGotaR.z + 4.0 || p.y < uGotaR.y - 3.0 || p.y > uGotaR.w + 14.0) return col;
  vec2 s = anc + (p - anc) / vec2(1.0 + 0.04 * uGota, 1.0 + 0.16 * uGota);
  vec4 c = tex(s);
  if (c.b > c.r + 0.12 && c.a > 0.5) return c;
  return col;
}

// adornos que se mueven solos (signos de pregunta, rayitos): se gira/corre todo lo que hay en su cajita
vec2 marca(vec2 p, vec4 b, vec4 m){
  if (b.z <= b.x || p.x < b.x || p.x > b.z || p.y < b.y || p.y > b.w) return vec2(-1.0);
  vec2 c = (b.xy + b.zw) * 0.5, q = (p - c - m.yz) / max(m.w, 0.02);
  vec2 r = c + vec2(cos(-m.x) * q.x - sin(-m.x) * q.y, sin(-m.x) * q.x + cos(-m.x) * q.y);
  if (r.x < b.x || r.x > b.z || r.y < b.y || r.y > b.w) return vec2(-3.0);
  return r;
}
// lágrimas que corren: brillitos que bajan por lo celeste
vec4 agua(vec4 col, vec2 p, vec4 b, float k){
  if (b.z <= b.x || p.x < b.x || p.x > b.z || p.y < b.y || p.y > b.w) return col;
  if (!(col.b > col.r + 0.04 && col.b > 0.55 && col.a > 0.2)) return col;
  float ola = pow(0.5 + 0.5 * sin(p.y * 0.42 - uT * 7.0 + k * 2.3 + p.x * 0.15), 4.0);
  return vec4(mix(col.rgb, vec3(1.0), ola * 0.55), min(1.0, col.a + ola * 0.2));
}
float mascara(vec2 q){ vec2 u = q / uSize; if (u.x < 0. || u.y < 0. || u.x > 1. || u.y > 1.) return 0.0; return texture2D(uEMask, u).r; }
float zonaDeb(vec2 q){ vec2 u = q / uSize; if (u.x < 0. || u.y < 0. || u.x > 1. || u.y > 1.) return 0.0; return texture2D(uEMask, u).g; }
// el chorro de mate de "escupe": sale de la boca, vuela y se desvanece
vec4 escupir(vec4 col, vec2 p){
  if (uScup.y < 0.01 && uScup.z > 0.99) return col;   // todavía no empezó a desvanecerse: el dibujo tal cual
  vec2 u = p / uSize;
  vec4 base = col;
  if (zonaDeb(p) > 0.5) base = texture2D(uEDeb, u);            // lo que hay debajo del chorro
  vec2 dir = normalize(p - uScupO + 0.001);
  vec2 q = p - dir * uScup.y;
  float mq = mascara(q);
  if (mq > 0.5 && distance(q, uScupO) < uScup.x) {
    vec4 c = tex(q); float a = c.a * uScup.z;
    return vec4(mix(base.rgb, c.rgb, a / max(a + base.a * (1.0 - a), 0.001)), a + base.a * (1.0 - a));
  }
  return base;
}

// globo de la nariz (dormido): celeste transparente, con borde y brillito
vec4 globo(vec4 col, vec2 p){
  if (uPop.y > 0.01) {   // se reventó: un anillito que se abre y se va
    float d = distance(p, uBurb.xy);
    float k = (1.0 - smoothstep(0.0, 1.2, abs(d - uPop.x))) * uPop.y;
    col = mix(col, vec4(0.55, 0.75, 0.95, 1.0), k * 0.8);
  }
  if (uBurb.z < 0.5 || uBurb.w < 0.01) return col;
  float d = distance(p, uBurb.xy), r = uBurb.z;
  if (d > r + 1.2) return col;
  vec4 o = mix(col, vec4(0.78, 0.90, 1.0, 1.0), 0.45 * uBurb.w);
  float borde = 1.0 - smoothstep(0.55, 1.35, abs(d - r));
  o = mix(o, vec4(0.42, 0.62, 0.85, 1.0), borde * 0.85 * uBurb.w);
  vec2 bq = (p - uBurb.xy - vec2(-0.38, -0.38) * r) / vec2(0.26, 0.17) / r;
  o = mix(o, vec4(1.0), (1.0 - smoothstep(0.6, 1.0, length(bq))) * 0.9 * uBurb.w);
  if (d > r) o = mix(col, o, borde);
  return o;
}

// uff: el mate y la yerba salen volando; las rayitas se apagan
vec4 uffM(vec2 q){ vec2 u = q / uSize; if (u.x < 0. || u.y < 0. || u.x > 1. || u.y > 1.) return vec4(0.0); return texture2D(uUffM, u); }
vec4 uffVuela(vec4 col, vec2 p){
  vec4 m = uffM(p);
  vec4 o = m.g > 0.5 ? col * uLineas : (m.b > 0.5 ? vec4(0.0) : col);
  vec2 c = vec2(255.0, 240.0);
  vec2 q = p - c - uVuela.xy;
  q = c + vec2(cos(-uVuela.z) * q.x - sin(-uVuela.z) * q.y, sin(-uVuela.z) * q.x + cos(-uVuela.z) * q.y);
  if (uffM(q).r > 0.5) {
    vec4 s = tex(q); float a = s.a * uVuela.w;
    o = vec4(mix(o.rgb, s.rgb, a / max(a + o.a * (1.0 - a), 0.001)), a + o.a * (1.0 - a));
  }
  return o;
}

// una parte del dibujo (una mano) que gira alrededor de su muñeca, con borde suave para que no se corte
vec2 parte(vec2 p, vec4 b, vec2 piv, vec3 m){
  if (b.z <= b.x) return p;
  float w = smoothstep(b.x - 8.0, b.x + 4.0, p.x) * (1.0 - smoothstep(b.z - 4.0, b.z + 8.0, p.x))
          * smoothstep(b.y - 8.0, b.y + 4.0, p.y) * (1.0 - smoothstep(b.w - 4.0, b.w + 8.0, p.y));
  if (w <= 0.0) return p;
  float a = -m.x * w; vec2 q = p - piv - m.yz * w;
  return piv + vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
}

float manoM(vec2 q){ vec2 u = q / uSize; if (u.x < 0. || u.y < 0. || u.x > 1. || u.y > 1.) return 0.0; return texture2D(uHandM, u).r; }
// gota de sudor dibujada (para las caras que no la traen)
vec4 gotaDib(vec4 col, vec2 p){
  if (uGotaD.w < 0.01) return col;
  vec2 q = p - uGotaD.xy; float r = uGotaD.z;
  float d;
  if (q.y < 0.0) { float t = clamp(-q.y / (2.3 * r), 0.0, 1.0); d = abs(q.x) - r * (1.0 - t) * 0.98; if (-q.y > 2.3 * r) d = max(d, -q.y - 2.3 * r); }
  else d = length(q) - r;
  if (d > 1.2) return col;
  vec3 c = mix(vec3(0.66, 0.85, 0.98), vec3(0.45, 0.70, 0.93), smoothstep(-r, r, q.y));
  vec2 bq = (q - vec2(-0.35, -0.1) * r) / vec2(0.22, 0.38) / r;
  c = mix(c, vec3(1.0), (1.0 - smoothstep(0.6, 1.0, length(bq))) * 0.9);
  c = mix(c, vec3(0.16, 0.30, 0.50), smoothstep(-1.1, -0.2, d));
  float a = (1.0 - smoothstep(0.4, 1.2, d)) * uGotaD.w;
  return vec4(mix(col.rgb, c, a / max(a + col.a * (1.0 - a), 0.001)), a + col.a * (1.0 - a));
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uEsc - gl_FragCoord.y) / uEsc;
  // saltito al cambiar de cara (desde los pies)
  vec2 piso = vec2(170.0, uSize.y);
  p = piso + (p - piso) / uSquash;
  // respiración: todo sube un poco, el pecho se ensancha apenas
  float w = 1.0 - smoothstep(228.0, 292.0, p.y);
  w *= smoothstep(uCabX - 18.0, uCabX, p.x);
  p.y = uSize.y + (p.y - uSize.y) / (1.0 + uBreath);
  p.x = 170.0 + (p.x - 170.0) / (1.0 + uBreath * 0.7 * (1.0 - w));
  vec2 p0 = p;
  // cabeza: gira desde el cuello, el cuerpo no
  float a = -uHead.x * w;
  vec2 q = p - uCuello;
  q = vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  p = uCuello + q - uHead.yz * w;
  // la mano que explica acompaña lo que dice
  if (uExtra > 2.5) {
    float wm = smoothstep(uManoR.x, uManoR.x + 14.0, p.x) * (1.0 - smoothstep(uManoR.z, uManoR.w, p.y)) * smoothstep(uManoR.y - 14.0, uManoR.y, p.y);
    vec2 piv = uManoPiv; float am = -uMano * wm;
    vec2 qm = p - piv; p = piv + vec2(cos(am) * qm.x - sin(am) * qm.y, sin(am) * qm.x + cos(am) * qm.y);
  }
  vec4 ba = vec4(p, 0.0, 0.0);
  if (uInfla.w > 0.001) {   // cachetes inflados al toser
    vec2 dq = p - uInfla.xy; float dd = length(dq) / uInfla.z;
    if (dd < 1.0) p = uInfla.xy + dq / (1.0 + uInfla.w * (1.0 - dd) * (1.0 - dd));
  }
  p = parte(p, uPt0, uPv0, uPa0); p = parte(p, uPt1, uPv1, uPa1);
  if (uUff > 0.5) {   // la manito que tiembla
    float wx = smoothstep(104.0, 116.0, p.x) * (1.0 - smoothstep(158.0, 166.0, p.x));
    float wy = smoothstep(196.0, 206.0, p.y) * (1.0 - smoothstep(252.0, 272.0, p.y));
    p -= uManoT * wx * wy;
  }
  vec4 o0 = tex(p); bool gafa = (max(o0.r, max(o0.g, o0.b)) - min(o0.r, min(o0.g, o0.b))) < 0.08 && lum(o0.rgb) < 0.4 && o0.a > 0.5;
  if (uBocaTipo > 1.5 && !gafa) { ba = bocaAbierta(p); p = ba.xy; }
  if (uExtra > 0.5 && uExtra < 1.5) p = vapor(p);

  vec4 col = tex(p);
  vec2 mq = marca(p, uMk0, uMkA0); if (mq.x > -0.5) col = tex(mq); else if (mq.x < -2.5) col = vec4(0.0);
  mq = marca(p, uMk1, uMkA1); if (mq.x > -0.5) col = tex(mq); else if (mq.x < -2.5) col = vec4(0.0);
  mq = marca(p, uMk2, uMkA2); if (mq.x > -0.5) col = tex(mq); else if (mq.x < -2.5) col = vec4(0.0);
  mq = marca(p, uMk3, uMkA3); if (mq.x > -0.5) col = tex(mq); else if (mq.x < -2.5) col = vec4(0.0);
  col = agua(col, p, uAg0, 0.0); col = agua(col, p, uAg1, 1.0);
  if (uScup.w > 0.5) col = escupir(col, p);
  col = globo(col, p);
  if (uUff > 0.5) col = uffVuela(col, p);
  if (uHM > 0.5) {   // la mano que saluda: sólo la mano, con su muñeca de eje
    vec2 q = p0 - uHandR.yz; float an = -uHandR.x * (1.0 - smoothstep(uHandR.z - 48.0, uHandR.z - 12.0, p0.y));
    q = uHandR.yz + vec2(cos(an) * q.x - sin(an) * q.y, sin(an) * q.x + cos(an) * q.y);
    if (manoM(q) > 0.5) col = tex(q); else if (manoM(p) > 0.5 || manoM(p0) > 0.5) col = p0.y > uHandF.x && p0.x < uHandF.y ? vec4(0.075, 0.08, 0.09, 1.0) : vec4(0.0);
  }
  col = gotaDib(col, p);
  if (uTiene > 0.5) {
    col = ojo(col, p, uEyeL, uPupL);
    col = ojo(col, p, uEyeR, uPupR);
  }
  if (uBocaTipo > 0.5 && uBocaTipo < 1.5) col = boca(col, p);
  if (ba.z > 0.5) {
    // donde el dibujo ya era piel se deja; sólo se tapa lo que era boca
    vec3 o = tex(ba.xy).rgb;
    float k = esPiel(o) ? smoothstep(0.035, 0.012, lum(uPielBoca) - lum(o)) : 0.0;
    col = vec4(mix(uPielBoca, o, k), 1.0);
  }
  if (ba.w > 0.0) col = mix(col, vec4(INK, 1.0), ba.w);
  // anteojos redibujados: una capa encima, que se mueve con la cabeza
  if (uTieneG > 0.5) { vec2 ug = p / uSize; if (ug.x >= 0. && ug.y >= 0. && ug.x <= 1. && ug.y <= 1.) {
    vec4 g = texture2D(uGafas, ug); col = vec4(mix(col.rgb, g.rgb, g.a), max(col.a, g.a)); } }
  if (uExtra > 0.5 && uExtra < 1.5) col = cebar(col, p);
  if (uExtra > 1.5 && uExtra < 2.5) col = gota(col, p);
  gl_FragColor = col;
}`;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { return null; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['uTex','uSize','uEsc','uHead','uBreath','uSquash','uBlink','uLook','uMouth','uEyeL','uEyeR','uPupL','uPupR','uMP','uMQ','uTiene',
      'uBocaTipo','uMA','uMAa','uHabla','uT','uCuello','uCabX','uExtra','uGota','uMano','uPiel','uMarco','uPupM','uBordes','uBX','uPielBoca','uCierre','uHandM','uHM','uHandF','uHandR','uGotaD','uGafas','uTieneG','uGotaR','uManoR','uManoPiv','uMk0','uMk1','uMk2','uMk3','uMkA0','uMkA1','uMkA2','uMkA3','uAg0','uAg1','uScup','uScupO','uEMask','uEDeb','uInfla','uBurb','uPop','uVuela','uLineas','uUff','uManoT','uUffM','uPt0','uPt1','uPv0','uPv1','uPa0','uPa1']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var texturas = {}, bajando = {}, bordesT = {};
    function medidas(nombre) { return CARAS[nombre] || VIVO_SIN_MEDIDAS; }
    // tablita con el borde de arriba y de abajo de cada columna de la boca (para cerrarla)
    function bordesTex(nombre) {
      if (bordesT[nombre]) return bordesT[nombre];
      var bo = CARAS[nombre].bordes, n = bo.top.length, d = new Uint8Array(n * 4);
      // columnas sin medida: se completan con la vecina (si no, quedaban parches de piel en cualquier lado)
      ['top', 'bot'].forEach(function (k) { var v = bo[k], last = null, i;
        for (i = 0; i < n; i++) { if (Number.isFinite(v[i])) last = v[i]; else if (last != null) v[i] = last; }
        last = null; for (i = n - 1; i >= 0; i--) { if (Number.isFinite(v[i])) last = v[i]; else if (last != null) v[i] = last; } });
      for (var i = 0; i < n; i++) { d[i*4] = Math.round(bo.top[i] - 150); d[i*4+1] = Math.round(bo.bot[i] - 150); d[i*4+3] = 255; }
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return bordesT[nombre] = t;
    }
    // Una imagen (cara o máscara) → textura. Los callbacks esperan a que esté; si no llega, no se llaman.
    function cargar(clave, url, cb) {
      if (texturas[clave]) return cb && cb();
      if (bajando[clave]) { if (cb) bajando[clave].push(cb); return; }
      bajando[clave] = cb ? [cb] : [];
      var im = new Image();
      im.onload = function () {
        try {
          var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          texturas[clave] = t;
        } catch (e) { delete bajando[clave]; return; }
        var l = bajando[clave]; delete bajando[clave]; l.forEach(function (f) { f(); });
      };
      im.onerror = function () { delete bajando[clave]; };
      im.src = url;
    }
    // Lo que hace falta para mostrar una cara: su dibujo, sus máscaras y (escupe) la cara que viene después.
    function necesita(nombre, url, opc) {
      var l = [[nombre, url]];
      mascarasDe(medidas(nombre)).forEach(function (k) { l.push([k, urlMascara(VIVO_MASC[k])]); });
      if (opc && opc.despues) l.push([opc.despues.nombre, opc.despues.url]);
      return l;
    }
    function listo(nombre, url, opc) { return necesita(nombre, url, opc).every(function (x) { return !!texturas[x[0]]; }); }
    function preparar(nombre, url, opc, cb) {
      var l = necesita(nombre, url, opc), faltan = l.length;
      l.forEach(function (x) { cargar(x[0], x[1], function () { if (--faltan === 0 && cb) cb(); }); });
    }

    // ---------- estado y "física" ----------
    var reducido = REDUCIDO;
    var S = { cara: null, squash: [1, 1], sqV: [0, 0], blink: 0, blinkFase: null, sigBlink: 1.2,
      look: [0, 0], lookObj: [0, 0], sigMirada: 0.8, boca: 0, bocaV: 0, bocaObj: 0, hablando: false, cabeza: [0, 0, 0], nod: 0, nodV: 0, hab: 0,
      despues: null, espPend: null };
    var api = { canvas: cv, S: S, forzar: null };   // forzar: para probar desde la consola ({ blink, mouth, look:[x,y], esp, esc })

    function ruido(t, s) { return Math.sin(t * 0.71 + s) * 0.5 + Math.sin(t * 1.37 + s * 2.1) * 0.3 + Math.sin(t * 2.83 + s * 0.7) * 0.2; }
    function resorte(x, v, obj, k, amort, dt) { var a = k * (obj - x) - amort * v; v += a * dt; x += v * dt; return [x, v]; }
    function parpadear(doble) { S.blinkFase = { t: 0, doble: doble }; }

    // El lienzo, a la resolución que se ve (en el panel mide ~115 px: con 1× sobra salvo pantallas muy densas)
    function medir() {
      var w = cv.clientWidth || 0, e = w && w * (window.devicePixelRatio || 1) > W * 1.05 ? 2 : 1;
      if (e !== ESC) { ESC = e; cv.width = W * ESC; cv.height = H * ESC; }
    }

    var tAnt = 0;
    function cuadro(ahora) {
      var dt = Math.min(0.05, (ahora - (tAnt || ahora)) / 1000); tAnt = ahora; var t = ahora / 1000;
      var c = medidas(S.cara), FZ = api.forzar;

      // parpadeo: cierra rápido, abre un poco más lento; a veces doble
      S.sigBlink -= dt;
      if (S.sigBlink <= 0 && !S.blinkFase) { parpadear(Math.random() < 0.18); S.sigBlink = 2.2 + Math.random() * 4; }
      if (S.blinkFase) {
        var b = S.blinkFase; b.t += dt;
        var cc = 0.07, h = 0.04, o = 0.11;
        S.blink = b.t < cc ? b.t / cc : b.t < cc + h ? 1 : b.t < cc + h + o ? 1 - (b.t - cc - h) / o : 0;
        S.blink = S.blink * S.blink * (3 - 2 * S.blink);
        if (b.t > cc + h + o) { S.blinkFase = null; S.blink = 0; if (b.doble) setTimeout(function () { parpadear(false); }, 90); }
      }

      // mirada: saltitos rápidos (como los ojos de verdad) y quieto entre medio
      S.sigMirada -= dt;
      if (S.sigMirada <= 0) {
        var r = Math.random();
        S.lookObj = r < 0.35 ? [0, 0] : r < 0.6 ? [-2.2, 1.4] : [(Math.random() * 2 - 1) * 2.2, (Math.random() * 2 - 1) * 1.2];
        S.sigMirada = 0.6 + Math.random() * 2.2;
        if (Math.random() < 0.3 && !S.blinkFase) parpadear(false); // al mover mucho los ojos se suele parpadear
      }
      for (var i = 0; i < 2; i++) S.look[i] += (S.lookObj[i] - S.look[i]) * Math.min(1, dt * 22);

      // boca: resorte hacia lo que pide la letra que se está diciendo
      var rb = resorte(S.boca, S.bocaV, S.bocaObj, 520, 30, dt); S.boca = rb[0]; S.bocaV = rb[1];
      S.boca = Math.max(0, Math.min(1.1, S.boca));
      // cabeceo al hablar, acompaña la boca
      var rn = resorte(S.nod, S.nodV, S.hablando ? S.bocaObj * 1.2 : 0, 60, 9, dt); S.nod = rn[0]; S.nodV = rn[1];

      S.hab += ((S.hablando ? 1 : 0) - S.hab) * Math.min(1, dt * 8);
      // cabeza: movimiento de "estar vivo" + cabeceo
      S.cabeza = [ruido(t * 0.55, 1) * 0.022 + (S.hablando ? ruido(t * 1.6, 4) * 0.012 : 0),
                  ruido(t * 0.4, 7) * 1.4,
                  ruido(t * 0.5, 3) * 0.8 - S.nod * 1.3 - (c.risa ? S.hab * Math.abs(Math.sin(t * 9)) * 1.6 : 0)];
      var esp = especiales(c, dt, t);
      S.cabeza[0] += esp.cab[0]; S.cabeza[1] += esp.cab[1]; S.cabeza[2] += esp.cab[2];
      var mano = ruido(t * 0.7, 9) * 0.02 + S.hab * Math.sin(t * 8.5) * 0.045;
      var fg = (t % 3.4) / 3.4, gotaV = fg < 0.78 ? Math.pow(fg / 0.78, 2) : Math.max(0, 1 - (fg - 0.78) / 0.08);
      var resp = Math.sin(t * 2 * Math.PI / 3.8) * 0.009 + 0.004;

      // saltito al cambiar de cara
      for (i = 0; i < 2; i++) { var rs = resorte(S.squash[i], S.sqV[i], 1, 260, 13, dt); S.squash[i] = rs[0]; S.sqV[i] = rs[1]; }

      var blink = S.blink, boca = S.boca, look = S.look;
      if (FZ) { if (FZ.blink != null) blink = FZ.blink; if (FZ.mouth != null) boca = FZ.mouth; if (FZ.look != null) look = FZ.look; }
      if (reducido) { S.cabeza = [0, 0, 0]; }

      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texturas[S.cara]);
      gl.uniform1i(U.uTex, 0); gl.uniform2f(U.uSize, W, H); gl.uniform1f(U.uEsc, ESC);
      gl.uniform3f(U.uHead, S.cabeza[0], S.cabeza[1], S.cabeza[2]); gl.uniform1f(U.uBreath, reducido ? 0 : resp);
      gl.uniform2f(U.uSquash, S.squash[0] * esp.sq[0], S.squash[1] * esp.sq[1]);
      gl.uniform4fv(U.uInfla, esp.infla); gl.uniform1f(U.uUff, esp.uff ? 1 : 0); gl.uniform4fv(U.uVuela, esp.vuela); gl.uniform1f(U.uLineas, esp.lineas); gl.uniform2fv(U.uManoT, esp.manoT);
      if (esp.uff && texturas.uff_m) { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, texturas.uff_m); gl.uniform1i(U.uUffM, 5); gl.activeTexture(gl.TEXTURE0); }
      gl.uniform4fv(U.uBurb, esp.burb); gl.uniform2fv(U.uPop, esp.pop);
      gl.uniform1f(U.uBlink, c.sinParpadeo ? 0 : blink); gl.uniform2f(U.uLook, c.sinMirada ? 0 : look[0], c.sinMirada ? 0 : look[1]); gl.uniform1f(U.uMouth, esp.boca != null ? esp.boca : boca);
      gl.uniform1f(U.uTiene, c.ojoL ? 1 : 0); gl.uniform3fv(U.uPiel, c.piel || [0.975, 0.755, 0.59]); gl.uniform1f(U.uMarco, c.marco || 0); gl.uniform1f(U.uPupM, c.pupM || 0);
      if (c.ojoL) {
        gl.uniform4fv(U.uEyeL, c.ojoL); gl.uniform4fv(U.uEyeR, c.ojoR);
        gl.uniform3fv(U.uPupL, c.pupL); gl.uniform3fv(U.uPupR, c.pupR);
      }
      gl.uniform1f(U.uBocaTipo, c.mudo ? 0 : c.boca ? 1 : c.abierta ? 2 : 0);
      if (c.boca) { gl.uniform4fv(U.uMP, c.boca); gl.uniform3fv(U.uMQ, c.bocaF); }
      if (c.abierta) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bordesTex(S.cara)); gl.uniform1i(U.uBordes, 1);
        gl.activeTexture(gl.TEXTURE0); gl.uniform2f(U.uBX, c.bordes.x0, c.bordes.top.length); gl.uniform3fv(U.uPielBoca, c.pielBoca); gl.uniform1f(U.uCierre, c.cierre || 1); }
      gl.uniform1f(U.uTieneG, 0);
      var hm = c.manoMask && texturas[c.manoMask];
      gl.uniform1f(U.uHM, hm ? 1 : 0);
      if (hm) { gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, texturas[c.manoMask]); gl.uniform1i(U.uHandM, 6); gl.activeTexture(gl.TEXTURE0);
        var an = Math.sin(t * 8) * 0.2;
        if (c.manoMov === 'chasquido') { var e0 = S.espE || 0; an = e0 < 0.3 ? 0.24 * Math.sin(e0 / 0.3 * Math.PI / 2) : e0 < 0.42 ? 0.24 * (1 - (e0 - 0.3) / 0.12) : -0.07 * Math.exp(-(e0 - 0.42) * 9) * Math.cos((e0 - 0.42) * 22); }
        gl.uniform3f(U.uHandR, reducido ? 0 : an, c.manoPiv[0], c.manoPiv[1]); gl.uniform2fv(U.uHandF, c.manoRelleno || [212, 262]); }
      if (c.gotaDib && !reducido) { var g = (t % 3.2) / 3.2; gl.uniform4f(U.uGotaD, c.gotaDib[0], c.gotaDib[1] + g * 7, c.gotaDib[2], g < 0.1 ? g / 0.1 : g > 0.8 ? (1 - g) / 0.2 : 1); }
      else gl.uniform4fv(U.uGotaD, c.gotaDib ? c.gotaDib.concat([1]) : [0, 0, 0, 0]);
      var mk = c.marcas || [];
      for (i = 0; i < 4; i++) {
        var m = mk[i]; gl.uniform4fv(U['uMk' + i], m ? m.caja : [0, 0, 0, 0]);
        var a = [0, 0, 0, 1];
        if (m && !reducido) {
          if (m.tipo === 'gira') a = [Math.sin(t * 2.6 + i * 2) * 0.16, Math.sin(t * 1.9 + i) * 1.2, Math.sin(t * 2.3 + i * 1.7) * 1.8, 1];
          else if (m.tipo === 'late') { var ph = (t * 1.25) % 1; a = [0, 0, 0, 1 + 0.16 * Math.exp(-ph * 9) + 0.1 * Math.exp(-Math.max(0, ph - 0.22) * 9) * (ph > 0.22 ? 1 : 0)]; }
          else if (m.tipo === 'pop') { var e1 = S.espE || 0, T = 0.42; a = [0, 0, 0, e1 < T ? 0.02 : 1 + 0.35 * Math.exp(-(e1 - T) * 7) * Math.cos((e1 - T) * 18)]; }
          else if (m.tipo === 'titila') a = [Math.sin(t * 3 + i * 2) * 0.12, 0, 0, 1 + Math.sin(t * 5.5 + i * 2.1) * 0.12];
          else a = [0, (Math.floor(t * 18) % 3 - 1) * 1.1, (Math.floor(t * 23 + 1) % 3 - 1) * 1.1, 1];
        }
        gl.uniform4fv(U['uMkA' + i], a);
      }
      var pts = c.partes || [];
      for (i = 0; i < 2; i++) {
        var pt = pts[i]; gl.uniform4fv(U['uPt' + i], pt ? pt.caja : [0, 0, 0, 0]); gl.uniform2fv(U['uPv' + i], pt ? pt.piv : [0, 0]);
        var mv = [0, 0, 0];
        if (pt && !reducido) {
          if (pt.mov === 'saluda') mv = [Math.sin(t * 9) * 0.22, 0, 0];
          else if (pt.mov === 'frota') mv = [0, Math.cos(t * 11) * 2.2, Math.sin(t * 11) * 1.6];
          else if (pt.mov === 'palmea') { var k = Math.sin(t * 6.5); mv = [0, k * 2.4, k * 0.9]; }
          else if (pt.mov === 'tiembla') mv = [Math.sin(t * 43) * 0.03 * (1 - S.hab), Math.sin(t * 57) * 0.9 * (1 - S.hab), Math.sin(t * 49 + 1) * 0.6 * (1 - S.hab)];
          else if (pt.mov === 'pulgar') { var s = Math.abs(Math.sin(t * 4 + i * 1.3)); mv = [Math.sin(t * 4 + i) * 0.05, 0, -s * 4]; }
        }
        gl.uniform3fv(U['uPa' + i], mv);
      }
      var ag = c.agua || [];
      gl.uniform4fv(U.uAg0, ag[0] || [0, 0, 0, 0]); gl.uniform4fv(U.uAg1, ag[1] || [0, 0, 0, 0]);
      gl.uniform4fv(U.uScup, escupeEstado(c, dt)); gl.uniform2fv(U.uScupO, c.escupe || [0, 0]);
      if (c.escupe && texturas.escupe_m) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texturas.escupe_m); gl.uniform1i(U.uEMask, 3);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, texturas.escupe_d); gl.uniform1i(U.uEDeb, 4); gl.activeTexture(gl.TEXTURE0); }
      gl.uniform4fv(U.uGotaR, c.gota || [0, 0, 0, 0]); gl.uniform4fv(U.uManoR, c.mano || [0, 0, 0, 0]); gl.uniform2fv(U.uManoPiv, c.manoPiv || [0, 0]);
      gl.uniform1f(U.uHabla, esp.boca != null ? 1 : (FZ && FZ.hab != null ? FZ.hab : S.hab)); gl.uniform1f(U.uT, reducido ? 0 : t);
      gl.uniform2fv(U.uCuello, c.cuello); gl.uniform1f(U.uCabX, c.cabX || -100);
      gl.uniform1f(U.uExtra, c.extra || 0); gl.uniform1f(U.uGota, reducido ? 0 : gotaV); gl.uniform1f(U.uMano, mano);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // escupe: el chorro ya está (como siempre); a los 1,2 s las gotas siguen volando y se desvanecen,
    // y pasa a "vida" o a "triste" (lo elige el comentario con el sorteo de la jugada: S.despues)
    function escupeEstado(c, dt) {
      if (!c.escupe) { S.escT = null; return [0, 0, 1, 0]; }
      if (S.escT == null) S.escT = 0;
      S.escT += dt; var e = S.escT, FZ = api.forzar;
      if (FZ && FZ.esc != null) return [FZ.esc[0], FZ.esc[1], FZ.esc[2], 1];
      var T0 = 1.2, TD = 0.7;
      if (e < T0) return [400, 0, 1, 1];
      if (e < T0 + TD) { var k = (e - T0) / TD; return [400, k * 12, 1 - k * k, 1]; }
      if (!S.escFin) { S.escFin = true; var d = S.despues; if (d && texturas[d.nombre]) cambiarCara(d.nombre); }
      return [400, 12, 0, 1];
    }

    // tos (atraganta), globo de la nariz (dormido) y bostezo: cada uno con su reloj
    var TOS = [0.07, 0.36, 0.58, 0.95, 1.26];   // los golpes del audio "cof cofcof" (tos1.wav)
    function especiales(c, dt, t) {
      var r = { cab: [0, 0, 0], sq: [1, 1], infla: [0, 0, 1, 0], burb: [0, 0, 0, 0], pop: [0, 0], boca: null, uff: false, vuela: [0, 0, 0, 1], lineas: 1, manoT: [0, 0] };
      if (S.espCara !== S.cara) {
        // Reloj de la cara nueva. Si un sonido la acompaña (la tos), arranca cuando arrancó el sonido.
        var pd = S.espPend; S.espPend = null;
        S.espCara = S.cara; S.espT = pd && pd.cara === S.cara ? performance.now() / 1000 - pd.t0 : 0; S.dormCiclo = 0;
      }
      S.espT += dt; var FZ = api.forzar, e = (FZ && FZ.esp != null) ? FZ.esp : S.espT; S.espE = e;
      if (c.ruego && !reducido) r.cab = [Math.sin(e * 2.4) * 0.035, Math.sin(e * 2.4) * 1.2, -Math.abs(Math.sin(e * 2.4)) * 1.2];
      if (c.bronca && !reducido) { var b = (e % 2.6) < 0.5 ? 1 : 0; r.cab = [Math.sin(e * 38) * 0.02 * b, Math.sin(e * 41) * 1.6 * b, 0]; }
      if (c.niega && !reducido) { var f0 = e % 2.6, env = f0 < 1.3 ? Math.sin(f0 / 1.3 * Math.PI) : 0; r.cab = [Math.sin(e * 15) * 0.012 * env, Math.sin(e * 15) * 4.2 * env, 0]; }
      if (c.suspira && !reducido) {
        var f1 = e % 4.6, s1 = f1 < 1.6 ? Math.sin(f1 / 1.6 * Math.PI / 2) : f1 < 2.6 ? Math.cos((f1 - 1.6) / 1.0 * Math.PI / 2) : 0;
        r.cab = [-0.02 * s1, 0, -3 * s1 + (f1 > 2.6 && f1 < 3.4 ? Math.sin((f1 - 2.6) / 0.8 * Math.PI) * 2.5 : 0)];
        r.sq = [1 + 0.012 * s1, 1 + 0.022 * s1];
      }
      if (c.uff) {
        r.uff = true;
        // el mate queda un instante y sale volando girando; las rayitas se apagan; la manito tiembla
        var U0 = 0.06, UV = 0.75;
        var ku = Math.max(0, Math.min(1, (e - U0) / UV)), kk = ku * ku;
        r.vuela = [kk * 90, kk * 55 - Math.sin(ku * Math.PI) * 18, kk * 1.6, 1 - Math.max(0, (ku - 0.55) / 0.45)];
        r.lineas = 1 - Math.max(0, Math.min(1, (e - U0) / 0.35));
        if (!reducido) r.manoT = [Math.sin(e * 47) * 0.9 + Math.sin(e * 31) * 0.5, Math.sin(e * 39 + 1) * 0.7];
      }
      if (reducido) return r;
      if (c.tos) {
        // golpes de tos: el primero sincronizado con el audio; después, cada tanto, un "cof" suelto
        var k = 0, golpes = TOS.concat([3.4, 3.62, 6.9, 7.1, 7.32]);
        golpes.forEach(function (g) { var d = e - (g % 9.5); if (d > 0) k += Math.exp(-d / 0.085) * (g < 2 ? 1 : 0.7); });
        if (e > 9.5) S.espT -= 8;
        k = Math.min(k, 1.3);
        r.cab = [0.08 * k, -2 * k, 4.5 * k];
        r.sq = [1 + 0.05 * k, 1 - 0.06 * k];
        r.infla = [c.tos[0], c.tos[1], c.tos[2], 0.3 * k];
      }
      if (c.burbuja) {
        // se infla con la respiración; cada tercer globo cabecea y se le revienta
        var per = 3.4, ciclo = Math.floor(e / per), f = (e % per) / per;
        var cabecea = ciclo % 3 === 2;
        var s = Math.min(1, f / 0.82); s = s * s * (3 - 2 * s);
        var rsp = 1 + Math.sin(e * 5.2) * 0.06 * s;
        if (f < 0.86) {
          var rad = (1.5 + 15 * s) * rsp;
          r.burb = [c.burbuja[0] + rad * 0.8, c.burbuja[1] + rad * 0.45, rad, 1];
          if (cabecea) r.cab = [0.05 * s, 0, 6 * s * s];
        } else {
          var kb = (f - 0.86) / 0.14, rad2 = 16.5;
          r.pop = [rad2 + kb * 9, 1 - kb];
          r.burb = [c.burbuja[0] + rad2 * 0.8, c.burbuja[1] + rad2 * 0.45, rad2, 0];
          if (cabecea) { var v = Math.max(0, 1 - kb * 2.2); r.cab = [0.05 * v - 0.02 * Math.sin(kb * 9) * (1 - kb), 0, 6 * v - 2.5 * Math.sin(kb * 9) * (1 - kb)]; }
        }
      }
      if (c.bostezo) {
        // abre la boca despacio, la aguanta, la cierra; la cabeza va un poco para atrás
        var fb = (e % 5.2);
        var ab = fb < 1.3 ? fb / 1.3 : fb < 2.4 ? 1 : fb < 3.3 ? 1 - (fb - 2.4) / 0.9 : 0;
        ab = ab * ab * (3 - 2 * ab);
        r.boca = 0.25 + 0.75 * ab;
        r.cab = [-0.035 * ab, 0, -2.2 * ab];
        r.sq = [1 - 0.012 * ab, 1 + 0.02 * ab];
      }
      return r;
    }

    var cambioT = 0;
    function cambiarCara(nombre, sinSalto) {
      clearTimeout(cambioT);
      if (nombre === S.cara) return;
      function poner() { S.cara = nombre; S.escT = null; S.escFin = false; cv.setAttribute('data-vivo', nombre);
        if (medidas(nombre).ojoL) parpadear(false); }
      if (S.cara == null || sinSalto || reducido) return poner();
      S.sqV = [-1.6, 2.2]; // se estira para arriba y rebota
      cambioT = setTimeout(poner, 60);
    }

    // Sólo se dibuja mientras se ve (en otra pestaña, con el visor cerrado o el Pupi escondido, no gasta nada).
    var raf = 0, seVe = false;
    function tick(ahora) { raf = 0; if (!correr()) { tAnt = 0; return; } cuadro(ahora); raf = requestAnimationFrame(tick); }
    function correr() { return seVe && !document.hidden && S.cara != null && !!texturas[S.cara]; }
    function seguir() { if (!raf && correr()) raf = requestAnimationFrame(tick); }
    try {
      new IntersectionObserver(function (es) { seVe = es[es.length - 1].isIntersecting; if (seVe) medir(); seguir(); }).observe(cv);
    } catch (e) { seVe = true; }
    document.addEventListener('visibilitychange', seguir);
    window.addEventListener('resize', function () { medir(); });

    api.listo = listo;
    api.preparar = preparar;
    api.precargar = function (nombre, url) { preparar(nombre, url, null, null); };
    // Mostrar una cara (nombre del archivo: 'contento2', 'horror'…). opc.despues = { nombre, url }: la que sigue al escupir.
    api.mostrar = function (nombre, opc, sinSalto) {
      S.despues = opc && opc.despues || null;
      if (nombre === S.cara && !S.despues) return;
      if (nombre === S.cara) { S.escT = null; S.escFin = false; }
      cambiarCara(nombre, sinSalto); medir(); seguir();
    };
    // La boca: hasta dónde abrir (0 = labios juntos, 1 = bien abierta) mientras el globo escribe.
    api.boca = function (obj) { S.bocaObj = obj; };
    api.habla = function (si) { S.hablando = !!si; if (!si) S.bocaObj = 0; };
    // El reloj de los especiales de esa cara arranca en t0 (segundos de performance.now()): la tos, con el audio.
    api.alinear = function (nombre, t0) {
      S.espPend = { cara: nombre, t0: t0 };
      if (S.cara === nombre && S.espCara === nombre) { S.espT = performance.now() / 1000 - t0; S.espPend = null; }
    };
    api.cara = function () { return S.cara; };
    cv.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); api.perdido = true; if (api.alPerder) api.alPerder(); });
    return api;
  }
  /* en el juego, el pulgares arriba va sin la gota de sudor que le dibuja la web: acá es festejo, no nervios */
  delete VIVO_CARAS.dale.gotaDib;
  window.PupiVivo = { crear: crearVivo, caras: VIVO_CARAS };
})();
