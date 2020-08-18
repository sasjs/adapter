# Contributing

Contributions to SASjs are very welcome! When making a PR, test cases should be included. To help in unit testing, be sure to run the following when making changes:

```
# the following creates a tarball in the build folder of SASjs
npm run-script package:lib

# now go to your app and run:
npm install ../sasjs/build/<tarball filename>
```

Tests are run using cypress. Before running tests, you need to define the following backend services:

# SAS 9

```

filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
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
filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
%inc mc;
filename ft15f001 temp;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(OBJ,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mp_createwebservice(path=/Public/app/common,name=sendObj)
filename ft15f001 temp;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mp_createwebservice(path=/Public/app/common,name=sendArr)
filename ft15f001 temp;
parmcards4;
If you can keep your head when all about you   
    Are losing theirs and blaming it on you,   
If you can trust yourself when all men doubt you,
    But make allowance for their doubting too; 
;;;;
%mp_createwebservice(path=/Public/app/common,name=makeErr)
```

The above services will return anything you send. To run the tests simply launch `npm run cypress`.
