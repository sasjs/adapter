/**
  @file
  @brief Makes an invalid JSON file

  <h4> SAS Macros </h4>
**/

%webout(OPEN)
data _null_;
  file _webout;
  put ' the discovery channel ';
run;
%webout(CLOSE)
