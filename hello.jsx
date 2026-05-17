var map = null;
for (var i=1;i<=app.project.numItems;i++) {
  if (app.project.item(i).name==="Map" && app.project.item(i) instanceof CompItem) { map=app.project.item(i); break; }
}
for (var l=1;l<=map.numLayers;l++) {
  var lyr=map.layer(l);
  var fx=lyr.property("Effects");
  if (fx && fx.numProperties>0) alert(lyr.name+": "+fx.property(1).name);
}