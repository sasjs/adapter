/**
  @file
  @brief Returns JSON in Object format

  <h4> SAS Macros </h4>
**/

%webout(FETCH)
%webout(OPEN)
%macro x();
  %if %symexist(sasjs_tables) %then
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(OBJ,&table,missing=STRING,showmeta=YES)
  %end;
  %else %do i=1 %to &_webin_file_count;
    %webout(OBJ,&&_webin_name&i,missing=STRING,showmeta=YES)
  %end;
%mend x;
%x()
%webout(CLOSE)