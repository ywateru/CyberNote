// Research template: run only with stdout/stderr redirected to private mode0600 files.
// Fixed read-only source calls; raw JSON contains private source content.
function run(argv) {
 var app=Application('Notes');
 var out={version:1,counts:{},notes:[],failures:[]};
 function read(f){try{return {ok:true,value:f()}}catch(e){return {ok:false,code:Number(e.errorNumber)||0}}}
 out.counts.accounts=read(function(){return app.accounts().length});
 out.counts.folders=read(function(){return app.folders().length});
 out.counts.notes=read(function(){return app.notes().length});
 var count=out.counts.notes.ok?out.counts.notes.value:0;
 for(var i=0;i<Math.min(count,12);i++){
  var n=app.notes[i], m={index:i};
  m.id=read(function(){return n.id()});m.name=read(function(){return n.name()});
  m.container=read(function(){return n.container().id()});
  m.creation=read(function(){return n.creationDate().toISOString()});
  m.before=read(function(){return n.modificationDate().toISOString()});
  m.locked=read(function(){return n.passwordProtected()});m.shared=read(function(){return n.shared()});
  if(m.locked.ok && !m.locked.value && out.notes.filter(function(x){return !!x.body}).length<6){
    m.body=read(function(){return n.body()});m.plaintext=read(function(){return n.plaintext()});
    m.attachmentCount=read(function(){return n.attachments().length});m.attachments=[];
    var ac=m.attachmentCount.ok?m.attachmentCount.value:0;
    for(var j=0;j<Math.min(ac,4);j++){
      var a=n.attachments[j];
      m.attachments.push({index:j,id:read(function(){return a.id()}),name:read(function(){return a.name()}),cid:read(function(){return a.contentIdentifier()}),url:read(function(){return a.url()})});
    }
  }
  m.after=read(function(){return n.modificationDate().toISOString()});out.notes.push(m);
 }
 out.folders=[];var fc=out.counts.folders.ok?out.counts.folders.value:0;
 for(var k=0;k<Math.min(fc,24);k++){var f=app.folders[k];out.folders.push({id:read(function(){return f.id()}),name:read(function(){return f.name()}),container:read(function(){return f.container.id()}),children:read(function(){return f.folders().length})});}
 return JSON.stringify(out);
}