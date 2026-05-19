var c = app.project.activeItem;
$.writeln("Active: " + c.name);
for(var i=1;i<=c.numLayers;i++){
  $.writeln(i + ": " + c.layer(i).name);
}