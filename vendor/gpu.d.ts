declare class GPU {
  constructor(options?: any)
  public addFunction(f: any)
  public createKernel (f: any, opt?: any): any
}
