import SASjs from "./index";

const adapter = new SASjs();

it("should parse SAS9 source code", async done => {
  expect(sampleResponse).toBeTruthy();
  const parsedSourceCode = (adapter as any).parseSAS9SourceCode(sampleResponse);
  expect(parsedSourceCode).toBeTruthy();
  const sourceCodeLines = parsedSourceCode.split("\r\n");
  expect(sourceCodeLines.length).toEqual(5);
  expect(sourceCodeLines[0].startsWith("6")).toBeTruthy();
  expect(sourceCodeLines[1].startsWith("7")).toBeTruthy();
  expect(sourceCodeLines[2].startsWith("8")).toBeTruthy();
  expect(sourceCodeLines[3].startsWith("9")).toBeTruthy();
  expect(sourceCodeLines[4].startsWith("10")).toBeTruthy();
  done();
});

it("should parse generated code", async done => {
  expect(sampleResponse).toBeTruthy();
  const parsedGeneratedCode = (adapter as any).parseGeneratedCode(
    sampleResponse
  );
  expect(parsedGeneratedCode).toBeTruthy();
  const generatedCodeLines = parsedGeneratedCode.split("\r\n");
  expect(generatedCodeLines.length).toEqual(5);
  expect(generatedCodeLines[0].startsWith("MPRINT(MM_WEBIN)")).toBeTruthy();
  expect(generatedCodeLines[1].startsWith("MPRINT(MM_WEBLEFT)")).toBeTruthy();
  expect(generatedCodeLines[2].startsWith("MPRINT(MM_WEBOUT)")).toBeTruthy();
  expect(generatedCodeLines[3].startsWith("MPRINT(MM_WEBRIGHT)")).toBeTruthy();
  expect(generatedCodeLines[4].startsWith("MPRINT(MM_WEBOUT)")).toBeTruthy();
  done();
});

/* tslint:disable */
const sampleResponse = `<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"/>
6          @file mm_webout.sas
7          @brief Send data to/from SAS Stored Processes
8          @details This macro should be added to the start of each Stored Process,
9          **immediately** followed by a call to:
10         %webout(OPEN)
MPRINT(MM_WEBIN):  ;
MPRINT(MM_WEBLEFT):   filename _temp temp lrecl=999999;
MPRINT(MM_WEBOUT):   data _null_;
MPRINT(MM_WEBRIGHT):  file _temp;
MPRINT(MM_WEBOUT):   if upcase(symget('_debug'))='LOG' then put '&gt;&gt;weboutBEGIN&lt;&lt;';
`;
/* tslint:enable */
