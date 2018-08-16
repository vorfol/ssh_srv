"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const util = require("util");
const inspect = util.inspect;
const ssh2 = require("ssh2");
const utils = ssh2.utils;
const OPEN_MODE = ssh2.SFTP_OPEN_MODE;
const STATUS_CODE = ssh2.SFTP_STATUS_CODE;
;
//global, for any sessions
let fileStats = [];
new ssh2.Server({
    hostKeys: [fs.readFileSync('one.key')]
}, function (client) {
    console.log('Client connected!');
    client.on('authentication', function (ctx) {
        if (ctx.method === 'password' &&
            ctx.username === 'foo' &&
            ctx.password === 'bar') {
            ctx.accept();
        }
        else {
            ctx.reject();
        }
    }).on('error', function (error) {
        console.log(error); //silent
    }).on('ready', function () {
        console.log('Client authenticated!');
        client.on('session', function (accept, reject) {
            let session = accept();
            //EXEC
            session.once('exec', function (accept, reject, info) {
                console.log(`Client EXEC session ${inspect(info.command)}`);
                let stream = accept();
                let cmd = info.command.toString();
                stream.write(`Executing: ${cmd}\n`);
                if (cmd.startsWith('build')) {
                    stream.write(`...Done\n`);
                }
                else {
                    stream.write(`...Failed\n`);
                    stream.stderr.write(`Command ${cmd} isn't supported\n`);
                }
                stream.exit(0);
                stream.end();
            });
            //SFTP
            session.on('sftp', function (accept, reject) {
                console.log('Client SFTP session');
                //to hold fake handles
                let openFiles = {};
                let handleCount = 0;
                let sftpStream = accept();
                sftpStream.on('OPEN', function (reqid, filename, flags, attrs) {
                    // create a fake handle to return to the client, this could easily
                    // be a real file descriptor number for example if actually opening
                    // the file on the disk
                    let handle = new Buffer(4);
                    openFiles[handleCount] = filename;
                    handle.writeUInt32BE(handleCount++, 0, true);
                    sftpStream.handle(reqid, handle);
                    console.log(`Opening file for write ${filename}`);
                }).on('WRITE', function (reqid, handle, offset, data) {
                    let fnum;
                    if (handle.length !== 4 || !openFiles[fnum = handle.readUInt32BE(0, true)]) {
                        return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                    }
                    // fake the write
                    sftpStream.status(reqid, STATUS_CODE.OK);
                    let inspected = require('util').inspect(data);
                    console.log(`Write to file ${openFiles[fnum]} at offset ${offset}: ${inspected}`);
                }).on('STAT', function (reqid, path) {
                    // fake the status
                    let fileAattr = fileStats.find((value) => value.path === path);
                    if (fileAattr) {
                        sftpStream.attrs(reqid, fileAattr.attr);
                        console.log(`Status of ${path} is ${JSON.stringify(fileAattr.attr)}`);
                    }
                    else {
                        console.log(`Status of ${path} is undefined`);
                        sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
                    }
                }).on('SETSTAT', function (reqID, path, attrs) {
                    // fake the status
                    let fileAattrIdx = fileStats.findIndex((value) => value.path === path);
                    if (fileAattrIdx >= 0) {
                        fileStats[fileAattrIdx].attr = Object.assign(fileStats[fileAattrIdx].attr, attrs);
                    }
                    else {
                        let attr = {};
                        attr = Object.assign(attr, attrs);
                        fileStats.push({ path, attr });
                    }
                    sftpStream.status(reqID, STATUS_CODE.OK);
                }).on('CLOSE', function (reqid, handle) {
                    let fnum;
                    if (handle.length !== 4 || !openFiles[(fnum = handle.readUInt32BE(0, true))]) {
                        return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                    }
                    sftpStream.status(reqid, STATUS_CODE.OK);
                    console.log(`Closing file ${openFiles[fnum]}`);
                    delete openFiles[fnum];
                });
            });
            session.once('shell', function (accept, reject, info) {
                var stream = accept();
                stream.write("$ ");
                let command_buffer = '';
                stream.on('data', function (data) {
                    if (data[0] != 13) {
                        let ch = data.toString('utf8');
                        command_buffer += ch;
                        stream.write(ch);
                    }
                    else {
                        stream.write('\n');
                        let command = command_buffer;
                        command_buffer = '';
                        console.log(command);
                        var args = command.split(" ");
                        switch (args[0]) {
                            case "uptime":
                                stream.write("Server Uptime: " + Math.floor(process.uptime()) + "\n");
                                break;
                            case "echo":
                                args.shift();
                                stream.write(args.join(" ") + "\n");
                                break;
                            case "whoami":
                                stream.write('username' + "\n");
                                break;
                            case "exit":
                                stream.exit(0);
                                stream.end();
                                stream = undefined;
                                break;
                            case "quit":
                                stream.exit(0);
                                stream.end();
                                process.exit(0);
                                break;
                            default:
                                stream.stderr.write(args[0] + ": No such command!\n");
                                break;
                        }
                        if (typeof stream != 'undefined') {
                            stream.write("$ ");
                        }
                    }
                });
            });
        });
    }).on('end', function () {
        console.log('Client disconnected');
    });
}).listen(22, 'localhost', function () {
    console.log('Listening on port ' + this.address().port);
});
//allow exiting by 'quit' command
process.stdin.setEncoding('utf8');
process.stdin.on('data', (input) => {
    let command = '';
    if (typeof input === 'string') {
        command = input.trim();
    }
    else {
        let strUFT8 = input.toString('utf8');
        command = strUFT8.trim();
    }
    if (command.startsWith('quit')) {
        process.stdout.write(`Exiting...\n`);
        process.exit(0);
    }
});
//# sourceMappingURL=index.js.map