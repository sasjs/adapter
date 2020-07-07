[![](https://data.jsdelivr.com/v1/package/npm/sasjs/badge)](https://www.jsdelivr.com/package/npm/sasjs)

# SASjs

SASjs is a open-source framework for building Web Apps on SAS® platforms. You can use as much or as little of it as you like. This repository contains the JS adapter, the part that handles the to/from SAS communication on the client side. There are 3 ways to install it:

1 - `npm install sasjs` - for use in a node project

2 - [Download](https://cdn.jsdelivr.net/npm/sasjs/index.js) and use a copy of the latest JS file

3 - Reference directly from the CDN - in which case click [here](https://www.jsdelivr.com/package/npm/sasjs?tab=collection) and select "SRI" to get the script tag with the integrity hash.

If you are short on time and just need to build an app quickly, then check out [this video](https://vimeo.com/393161794) and the [react-seed-app](https://github.com/macropeople/react-seed-app) which provides some boilerplate.

For more information on building web apps with SAS, check out [sasjs.io](https://sasjs.io)


## None of this makes sense.  How do I build an app with it?

Ok ok.  Deploy this [example.html](https://github.com/macropeople/sasjs/blob/master/example.html) file to your web server, and update `servertype` to `SAS9` or `SASVIYA` depending on your backend.

The backend part can be deployed as follows:

```
%let appLoc=/Public/app/readme;  /* Metadata or Viya Folder location as per SASjs config */
/* compile macros (can also be downloaded & compiled seperately) */
filename mc url "https://raw.githubusercontent.com/macropeople/macrocore/master/mc_all.sas";
%inc mc; 
filename ft15f001 temp;
parmcards4;
  %webout(FETCH) /* receive all data as SAS datasets */
  proc sql;
  create table areas as select make,mean(invoice) as avprice
    from sashelp.cars
    where type in (select type from work.fromjs)
    group by 1;
  %webout(OPEN)
  %webout(OBJ,areas)
  %webout(CLOSE)
;;;;
%mp_createwebservice(path=&appLoc/common,name=getdata)
```

You now have a simple web app with a backend service!

# More resources

For more information specific to this adapter you can check out this [user guide](https://sasjs.io/sasjs/sasjs-adapter/) or the [technical](http://adapter.sasjs.io/) documentation. 

For more information on building web apps in general, check out these [resources](https://sasjs.io/training/resources/) or contact the [author](https://www.linkedin.com/in/allanbowe/) directly.