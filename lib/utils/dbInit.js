/**
 * @function dbInit
 * start up docker with a simple db initialization routine to create the
 * initial DB tables.
 * @return {Promise}
 */
const async = require("async");
const EventEmitter = require("events");
const path = require("path");
const { spawn } = require("child_process");
const shelljs = require("shelljs");

function ProcessData(context, data) {
    data = data.toString();
    if (!context.initBegan) {
        if (data.indexOf("initdb.d/01-CreateDBs.sql") > -1) {
            context.initBegan = true;
            console.log("... initializing tables");
        }
    } else {
        if (data.indexOf("mysqld: ready for connections.") > -1) {
            console.log("... init complete");
            context.endTrigger.emit("done");
        }
    }
}

module.exports = function(dbinitFileName = "dbinit-compose.yml") {
    var context = {
        initBegan: false,
        endTrigger: new EventEmitter()
    };

    var logProcess;

    return new Promise((resolve, reject) => {
        async.series(
            [
                (done) => {
                    // be sure there are no other ab stacks running:
                    console.log("... clearing out existing ab stacks");
                    shelljs.exec("docker stack rm ab", { silent: true });
                    done();
                },

                (done) => {
                    // create a docker process for initializing the DB
                    console.log("... booting up mysql");
                    shelljs.exec(
                        `docker stack deploy -c ${dbinitFileName} ab`,
                        { silent: true }
                    );
                    done();
                },

                (done) => {
                    // watch the log entries
                    var options = [];
                    logProcess = spawn(
                        path.join(process.cwd(), "logs.js"),
                        options,
                        {
                            // stdio: ["ignore", "ignore", "ignore"]
                        }
                    );
                    logProcess.stdout.on("data", (data) => {
                        ProcessData(context, data);
                    });
                    logProcess.stderr.on("data", (data) => {
                        ProcessData(context, data);
                    });
                    logProcess.on("error", (err) => {
                        console.log(err);
                    });
                    done();
                },

                (done) => {
                    // once we receive our final "ready for connections"
                    context.endTrigger.on("done", () => {
                        done();
                    });
                },

                (done) => {
                    // shut everything down
                    console.log("... shutting down");
                    logProcess.kill();
                    shelljs.exec("docker stack rm ab", { silent: true });
                    done();
                }
            ],
            (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log();
                console.log("... db initialized. ");
                console.log();
                resolve();
            }
        );
    });
};