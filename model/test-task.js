// app/models/bear.js

var mongoose     = require('mongoose');
var Schema       = mongoose.Schema;
var moment = require('moment');

var TestTaskSchema   = new Schema({
    "task_name" : String,
    "task_details" : String,
    "task_date" : Date,
    "task_order" : Number,
    "current_status" : String,
    "creation_date" : Date,
	"completed" : Boolean,
	"forwarded": {type: Boolean, default: false },
    "notes" : [ 
        {
            "note_type" : String,
            "note_date" : Date,
            "note" : String,
            "note_details" : {
            }
        }
    ]
});
module.exports = mongoose.model('TestTask', TestTaskSchema);