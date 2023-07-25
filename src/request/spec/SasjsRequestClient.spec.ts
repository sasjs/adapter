import {
  SASJS_LOGS_SEPARATOR,
  SasjsRequestClient,
  SasjsParsedResponse
} from '../SasjsRequestClient'
import { AxiosResponse } from 'axios'

describe('SasjsRequestClient', () => {
  const requestClient = new SasjsRequestClient('')
  const etag = 'etag'
  const status = 200

  const webout = `hello`
  const log = `1                                                          The SAS System                             Tuesday, 25 July 2023 12:51:00

NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA. 
NOTE: SAS (r) Proprietary Software 9.4 (TS1M7 MBCS3170) 
    Licensed to ANALYTIUM LTD- PARTNER LICENCE, Site 70221618.
NOTE: This session is executing on the Linux 3.10.0-1160.76.1.el7.x86_64 (LIN X64) platform.



NOTE: Analytical products:
    
    SAS/STAT 15.2
    SAS/ETS 15.2
    SAS/IML 15.2

NOTE: Additional host information:

Linux LIN X64 3.10.0-1160.76.1.el7.x86_64 #1 SMP Wed Aug 10 16:21:17 UTC 2022 x86_64 CentOS Linux release 7.9.2009 (Core) 


PROC MIGRATE will preserve current SAS file attributes and is 
recommended for converting all your SAS libraries from any 
SAS 8 release to SAS 9.  For details and examples, please see
http://support.sas.com/rnd/migration/index.html



NOTE: SAS initialization used:
    real time           0.01 seconds
    cpu time            0.02 seconds
    

NOTE: AUTOEXEC processing beginning; file is /home/sasjssrv/sasjs_root/sessions/20230725105113-96709-1690282273263/autoexec.sas.


NOTE: DATA statement used (Total process time):
    real time           9.34 seconds
    cpu time            0.12 seconds
    


NOTE: AUTOEXEC processing completed.

1          
2          options insert=(SASAUTOS="/home/sasjssrv/sasjs_root/drive/sas/sasautos");
3          
4          /* runtime vars */
5          %let _debug=131;
6          
7          filename _webout "/home/sasjssrv/sasjs_root/sessions/20230725105113-96709-1690282273263/webout.txt" mod;
8          
9          /* dynamic user-provided vars */
10         
11         %let _sasjs_tokenfile=/home/sasjssrv/sasjs_root/sessions/20230725105113-96709-1690282273263/reqHeaders.txt;
12         %let _sasjs_username=secretuser;
13         %let _sasjs_userid=1;
14         %let _sasjs_displayname=Super Admin;
15         %let _sasjs_apiserverurl=https://sas9.4gl.io;
16         %let _sasjs_apipath=/SASjsApi/stp/execute;
17         %let _sasjs_webout_headers=/home/sasjssrv/sasjs_root/sessions/20230725105113-96709-1690282273263/stpsrv_header.txt;
18         %let _metaperson=&_sasjs_displayname;
19         %let _metauser=&_sasjs_username;
20         
21         /* the below is here for compatibility and will be removed in a future release */
22         %let sasjs_stpsrv_header_loc=&_sasjs_webout_headers;
23         
24         %let sasjsprocessmode=Stored Program;
25         
26         %global SYSPROCESSMODE SYSTCPIPHOSTNAME SYSHOSTINFOLONG;
27         %macro _sasjs_server_init();
28         %if "&SYSPROCESSMODE"="" %then %let SYSPROCESSMODE=&sasjsprocessmode;
29         %if "&SYSTCPIPHOSTNAME"="" %then %let SYSTCPIPHOSTNAME=&_sasjs_apiserverurl;
30         %mend;
31         %_sasjs_server_init()
32         
33         
34         
35         /* user autoexec starts */
36         
37         /* user autoexec ends */
38         
39         /* actual job code */
40         data _null_;
41           file _webout;
42           put 'hello';
43         run;

NOTE: The file _WEBOUT is:
    Filename=/home/sasjssrv/sasjs_root/sessions/20230725105113-96709-1690282273263/webout.txt,
    Owner Name=sasjssrv,Group Name=sasjssrv,
    Access Permission=-rw-rw-r--,
    Last Modified=25 July 2023 12:51:22,
    File Size (bytes)=0

NOTE: 1 record was written to the file _WEBOUT.
    The minimum record length was 5.
    The maximum record length was 5.
NOTE: DATA statement used (Total process time):
    real time           0.00 seconds
    cpu time            0.00 seconds
    

NOTE: SAS Institute Inc., SAS Campus Drive, Cary, NC USA 27513-2414
NOTE: The SAS System used:
    real time           9.36 seconds
    cpu time            0.14 seconds
    
`
  const printOutput = 'printOutPut'

  describe('parseResponse', () => {})

  it('should parse response with 1 log', () => {
    const response: AxiosResponse<any> = {
      data: `${webout}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${log}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: {}
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${log}
`,
      etag,
      status
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with 1 log and printOutput', () => {
    const response: AxiosResponse<any> = {
      data: `${webout}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${log}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${printOutput}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: {}
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${log}
`,
      etag,
      status,
      printOutput: `
${printOutput}`
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with nested logs', () => {
    const logWithNestedLog = `root log start
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${log}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
root log end`

    const response: AxiosResponse<any> = {
      data: `${webout}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${logWithNestedLog}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: {}
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${logWithNestedLog}
`,
      etag,
      status
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with nested logs and printOutput', () => {
    const logWithNestedLog = `root log start
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${log}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
log with indentation
  SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
  ${log}
  SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
some SAS code containing SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
root log end`

    const response: AxiosResponse<any> = {
      data: `${webout}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${logWithNestedLog}
SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784
${printOutput}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: {}
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${logWithNestedLog}
`,
      etag,
      status,
      printOutput: `
${printOutput}`
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })
})

describe('SASJS_LOGS_SEPARATOR', () => {
  it('SASJS_LOGS_SEPARATOR should be hardcoded', () => {
    expect(SASJS_LOGS_SEPARATOR).toEqual(
      'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'
    )
  })
})
