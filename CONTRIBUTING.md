# Contributing

Contributions to SASjs are very welcome!  When making a PR, test cases should be included.  To help in unit testing, be sure to run the following when making changes:

```
# the following creates a tarball in the build folder of SASjs
npm run-script package:lib

# now go to your app and run:
npm install ../sasjs/build/<tarball filename>
```

Tests are run using cypress.  Before running tests, you need to define the following backend services:

# SAS 9
```

filename mc url "https://raw.githubusercontent.com/macropeople/macrocore/master/mc_all.sas?_=1";
%inc mc;
filename ft15f001 temp;
parmcards4;
  %webout(OPEN)
  %macro x();
  %do i=1 %to &_webin_file_count; %webout(OBJ,&&_webin_name&i) %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mm_createwebservice(path=/Public/app/common,name=sendObj)
parmcards4;
  %webout(OPEN)
  %macro x();
  %do i=1 %to &_webin_file_count; %webout(ARR,&&_webin_name&i) %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mm_createwebservice(path=/Public/app/common,name=sendArr)
```

# Viya
```
filename mc url "https://raw.githubusercontent.com/macropeople/macrocore/master/mc_all.sas";
%inc mc;

filename ft15f001 temp;
parmcards4;
  %webout(OPEN)
  %global sasjs_tables;
  %let sasjs_tables=&sasjs_tables;
  %put &=sasjs_tables;
  %let sasjs_tables=&sasjs_tables;
  %macro x();
  %global sasjs_tables;
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(OBJ,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mv_createwebservice(path=/Public/app/common,name=sendObj)
filename ft15f001 temp;
parmcards4;
  %webout(OPEN)
  %global sasjs_tables;
  %let sasjs_tables=&sasjs_tables;
  %put &=sasjs_tables;
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mv_createwebservice(path=/Public/app/common,name=sendArr)
```

The above services will return anything you send.  To run the tests simply launch `npm run cypress`.