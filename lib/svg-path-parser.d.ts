// types/svg-path-parser.d.ts
declare module 'svg-path-parser' {
  interface SVGCommand {
    code: string;
    command: string;
    x?: number;
    y?: number;
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  function parseSVG(path: string): SVGCommand[];
  
  export = parseSVG;
}