/* =======================================================
   SHIBA PIMS
   Officer Manager
======================================================= */

class OfficerManager{

    constructor(){

        this.officers=[];

    }

    create(officer){

        officer.id=this.generateID();

        officer.created=new Date().toISOString();

        this.officers.push(officer);

        console.log("Officer created",officer);

    }

    generateID(){

        const random=Math.random().toString(36).substring(2,8).toUpperCase();

        return "SH-"+new Date().getFullYear()+"-"+random;

    }

    getAll(){

        return this.officers;

    }

    getByID(id){

        return this.officers.find(o=>o.id===id);

    }

    delete(id){

        this.officers=this.officers.filter(o=>o.id!==id);

    }

}

const Officers=new OfficerManager();