/**
  @file
  @brief Returns JSON in Array format

  <h4> SAS Macros </h4>
**/

%webout(FETCH)
%webout(OPEN)
%macro x();
  /* sasjs_tables is empty when the request carries no input tables, so it
     must be tested for length as well as existence - countw() with no
     argument is a macro error. */
  %if %symexist(sasjs_tables) and %length(&sasjs_tables) %then
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table,missing=STRING,showmeta=YES)
  %end;
  %else %do i=1 %to &_webin_file_count;
    %webout(ARR,&&_webin_name&i,missing=STRING,showmeta=YES)
  %end;
%mend x;
%x()
%webout(CLOSE)