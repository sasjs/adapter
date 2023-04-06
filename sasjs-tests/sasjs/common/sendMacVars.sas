/**
  @file
  @brief Returns Macro Variables

  <h4> SAS Macros </h4>
**/

data work.macvars;
  set sashelp.vmacro;
run;
%webout(OPEN)
%webout(OBJ,macvars)
%webout(CLOSE)