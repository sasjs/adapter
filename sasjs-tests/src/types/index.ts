export interface Test {
  title: string;
  description: string;
  beforeTest?: (...args: any) => Promise<any>;
  afterTest?: (...args: any) => Promise<any>;
  test: (context?: any) => Promise<any>;
  assertion: (...args: any) => boolean;
}

export interface TestSuite {
  name: string;
  tests: Test[];
  beforeAll?: (...args: any) => Promise<any>;
  afterAll?: (...args: any) => Promise<any>;
}
