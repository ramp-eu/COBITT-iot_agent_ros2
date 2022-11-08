var ROSNodes = [];
var ros2Subscribers = [];
var ros2Publishers = [];
var lastMessages = {};
var rosDevices = [];
// var GPIOActionClients = [];

var iotAgentLib = require("iotagent-node-lib"),
    http = require("http"),
    express = require("express"),
    config = require("./config"),
    rclnodejs = require('rclnodejs'),
    GPIO = rclnodejs.require('pi_gpio_interface/action/GPIO');

function provisioningHandler(device, callback)
{
    var devID = device.id;
    var activeNode = ROSNodes.find(o => o.name === devID);
   
    if (activeNode == null)
    {
        console.log('\n\n* REGISTERING A NEW DEVICE:\n%s\n\n', JSON.stringify(device, null, 4));

        if (device.type == "IOT")
        {
            initIOTDevice(device);
        }
        else
        {
            initROSDevice(device);
        }
    }
            
        
    
    // iotAgentLib.register(device, function (error, device)
    // {
    //     if (error)
    //     {
    //         console.log(error);
    //         callback(error);
    //     }
    //     else
    //     {
    //         console.log('\n\n* REGISTERING A NEW DEVICE:\n%s\n\n', JSON.stringify(device, null, 4));

    //         if (device.type == "IOT")
    //         {
    //             initIOTDevice(device);
    //         }
    //         else
    //         {
    //             initROSDevice(device);
    //         }
    //         callback(device);
    //     }
    // });

    callback(null, device);
}

function unregisterDevice(device, callback) 
{
    iotAgentLib.unregister(device.id, device.service, device.subservice, function(error, device)
    {
        if (error)
        {
            callback(null);
        }
        else{
            callback(null, device);
        }
    });
}

function initIOTDevice(ros2Device) 
{
  // Create Node
  let nodeID = ros2Device.id;
  var ROS_Node = rclnodejs.createNode('pi_gpio_action_client');
  var newNode = { name: nodeID, node: ROS_Node };
  ROSNodes.push(newNode);

//   const client = new GPIOActionClient(ROS_Node);

//   var newGPIOActionClient = { name: nodeID, GPIOActionClient: client };
//   GPIOActionClients.push(newGPIOActionClient);
}

function initializeRobot() 
{
    var dev = iotAgentLib.listDevices('openiot', '/', function (error, device) 
    {
        if (error) 
        {
            console.log("Device Not Found");
            callback(error);
        }
        else 
        {
            try 
            {
                rclnodejs.init().then(() => 
                {
                    for (var i = 0; i < device.count; i++) 
                    {
                        ros2Device = device.devices[i];

                        if (ros2Device.type == "IOT")
                        {
                            initIOTDevice(ros2Device);
                        }
                        else
                        {
                            initROSDevice(ros2Device);
                        }
                    }
                });

                console.log("Robot initialized!");
            } 
            catch (error) {
                console.log(error); 
                callback(error);
            }
        }
    });
}

function initROSDevice(ros2Device) 
{
    activeAttributes = ros2Device.active;
    internalAttributes = ros2Device.internalAttributes;

    // Create Node
    let nodeID = ros2Device.id;
    var ROS_Node = rclnodejs.createNode('robot_srv_client_node');
    var newNode = { name: nodeID, node: ROS_Node };
    ROSNodes.push(newNode);

    //ROS_Node.createClient('std_srvs/srv/Empty','start_follower');
    // ROS_Node.createClient('std_srvs/srv/Trigger','start_follower_b');
    // ROS_Node.createClient('std_srvs/srv/Trigger','start_follower_c');
    //ROS_Node.createClient('std_srvs/srv/Empty','stop_follower');

    internalAttributes.map(function (interfaceDescriptor) {
        var internalJson = interfaceDescriptor;
        var key = Object.keys(interfaceDescriptor);

        let subORpub = internalJson[key].ros2Interface.value;
        let topicType = internalJson[key].topicType.value;
        let topicName = internalJson[key].topicName.value;

        // Create publisher
        if (subORpub == "publisher") {
            var publisher = ROS_Node.createPublisher(topicType, topicName);
            var newPublisher = { name: nodeID, publisher: publisher };
            ros2Publishers.push(newPublisher);
        }
    });

    activeAttributes.map(function (interfaceDescriptor) {
        let subscriberName = interfaceDescriptor.name;
        let topicType = interfaceDescriptor.metadata.topicType.value;
        let topicName = interfaceDescriptor.metadata.topicName.value;
        let throttlingInMilliseconds = interfaceDescriptor.metadata.throttlingInMilliseconds.value; lastMessages[subscriberName] = {};
        lastMessages[subscriberName]['msg'] = 'None';
        lastMessages[subscriberName]['lastDataSampleTs'] = new Date().getTime();
        lastMessages[subscriberName]['throttling'] = throttlingInMilliseconds;

        var rosDevice = { topic: topicName, device: ros2Device };
        rosDevices.push(rosDevice);

        let subscription = ROS_Node.createSubscription(topicType, topicName, (msg) => {
            console.log(`Received message: ${typeof msg}`, msg);
            let lastTs = lastMessages[subscriberName].lastDataSampleTs;
            let newTs = new Date().getTime();
            let interval = newTs - lastTs;
            if (interval >= lastMessages[subscriberName].throttling) {
                lastMessages[subscriberName].msg = msg;
                lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
                attribute = {};
                attribute.name = subscriberName;
                attribute.type = 'object';
                attribute.value = msg;
                attribute.metadata = {};
                attribute.metadata.topicType = { type: 'string', value: topicType };
                attribute.metadata.topicName = { type: 'string', value: topicName };
                attribute.metadata.throttlingInMilliseconds = {
                    type: 'number',
                    value: throttlingInMilliseconds
                };

                var incomingRosDevice = rosDevices.find(o => o.topic === topicName);

                iotAgentLib.update(incomingRosDevice.device.name, incomingRosDevice.device.type, '', [attribute], incomingRosDevice.device, function (error) {
                    if (error) {
                        console.log('Something went wrong!!!');
                        console.log(error);
                    } else {
                        console.log(`Received message:`);
                        console.log(lastMessages[subscriberName]);
                    }
                });
                lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
            }
        });

        //ROS_Node.spin();

        var newSubscriber = { name: nodeID, subscription: subscription };
        ros2Subscribers.push(newSubscriber);
    });
}

function robotSim(command, activeNode, activePublisher) {
    activePublisher.publish(command.value);
    rclnodejs.spinOnce(activeNode);
}

function initSouthbound(callback) {
    southboundServer = {
        server: null,
        app: express(),
        router: express.Router(),
    };

    southboundServer.app.set("port", 8080);
    southboundServer.app.set("host", "0.0.0.0");

    southboundServer.router.get("/iot/d", manageULRequest);
    southboundServer.server = http.createServer(southboundServer.app);
    southboundServer.app.use("/", southboundServer.router);
    southboundServer.server.listen(southboundServer.app.get("port"), southboundServer.app.get("host"), callback);
}

function manageULRequest(req, res, next) {
    var values;

    iotAgentLib.retrieveDevice(req.query.i, req.query.k, function (error, device) {
        if (error) {
            res.status(404).send({
                message: "Couldn't find the device: " + JSON.stringify(error),
            });
        } else {
            values = parseUl(req.query.d, device);
            iotAgentLib.update(device.name, device.type, "", values, device, function (error) {
                if (error) {
                    res.status(500).send({
                        message: "Error updating the device",
                    });
                } else {
                    res.status(200).send({
                        message: "Device successfully updated",
                    });
                }
            });
        }
    });
}

function parseUl(data, device) {
    function findType(name) {
        for (var i = 0; i < device.active.length; i++) {
            if (device.active[i].name === name) {
                return device.active[i].type;
            }
        }

        return null;
    }

    function createAttribute(element) {
        var pair = element.split("|"),
            attribute = {
                name: pair[0],
                value: pair[1],
                type: findType(pair[0]),
            };

        return attribute;
    }

    return data.split(",").map(createAttribute);
}

iotAgentLib.activate(config, function (error) {
    if (error) {
        console.log("There was an error activating the IOTA");
        process.exit(1);
    } else {
        initSouthbound(function (error) {
            if (error) {
                console.log("Could not initialize South bound API due to the following error: %s", error);
            } else {
                console.log("Both APIs started successfully");

                iotAgentLib.setProvisioningHandler(provisioningHandler);
                iotAgentLib.setDataUpdateHandler(updateContextHandler);
                iotAgentLib.setRemoveDeviceHandler(unregisterDevice);

                initializeRobot();
            }
        });
    }
});

function updateContextHandler(id, type, service, subservice, attributes, callback) 
{
    if (type == "ROS2System")
    {
        iotAgentLib.getDeviceByName(id, service, subservice, function (error, device) 
        {
            var devID = device.id;
            var activeNode = ROSNodes.find(o => o.name === devID);

            //var activePublisher = ros2Publishers.find(o => o.name === devID);

            if (error) 
            {
                console.log("Device Not Found");
                callback(error);
            }
            else 
            {
                var command = attributes[0];
                //var client = activeNode.node._clients.find(o=>o._serviceName == command.value);

                var ROS_Node = rclnodejs.createNode('robot_srv_client_node');   
                const client = ROS_Node.createClient('std_srvs/srv/Empty', command);


//start_follower_robot1_a
//start_follower_robot1_b
//start_follower_robot2_a
//start_follower_robot2_b

//stop_robot1
//stop_robot2


                const request = {};

                client.waitForService(1000).then((result) => {
                    if (!result) {
                        console.log('Error: service not available');
                        //rclnodejs.shutdown();
                        return;
                    }
                    console.log(`Sending: ${typeof request}`, request);
                    client.sendRequest(request, (response) => {
                        console.log(`Result: ${typeof response}`, response);
                        //rclnodejs.shutdown();
                    });
                });

                rclnodejs.spin(ROS_Node);

                //robotSim(command, activeNode.node, activePublisher.publisher);

                callback(null, device);
            }
        });
    }
    else if (type == "IOT")
    {
        iotAgentLib.getDeviceByName(id, service, subservice, function (error, device) 
        {
            var devID = device.id;
            var activeNode = ROSNodes.find(o => o.name === devID);
            //var activeClient = GPIOActionClients.find(o => o.name === devID);

            if (error) 
            {
                console.log("Device Not Found");
                callback(error);
            }
            else 
            {
                var command = attributes[0];
                              
                // const myclient = activeClient.GPIOActionClient;
                // myclient.sendGoal(command, device);
                // rclnodejs.spin(activeNode.node);

                var ROS_Node = rclnodejs.createNode('pi_gpio_action_client');
                const client = new GPIOActionClient(ROS_Node);
                client.sendGoal(command, device);
                rclnodejs.spin(ROS_Node);

                callback(null, device);
            }
        });
    }
    callback(null);
}

class GPIOActionClient 
{
    constructor(node) 
    {
        try 
        {
            this._node = node;

            this._actionClient = new rclnodejs.ActionClient(
                node,
                'pi_gpio_interface/action/GPIO',
                 'pi_gpio_server'
            );
        } 
        catch (error) 
        {
            console.log(error);
        }
    }

    async sendGoal(command, device) 
    {
        var stringCommand = command.value.split(",");

        // Read
        if (stringCommand[1] == "read")
        {
            this._node.getLogger().info('Waiting for action server...');
            await this._actionClient.waitForServer();

            const goal = new GPIO.Goal();

            goal.gpio = command.value; // Read
        
            this._node.getLogger().info('Sending goal request...');

            const goalHandle = await this._actionClient.sendGoal(goal, (feedback) =>
                this.feedbackCallback(feedback)
            );

            if (!goalHandle.isAccepted()) {
                this._node.getLogger().info('Goal rejected');
                return;
            }

            this._node.getLogger().info('Goal accepted');

            const result = await goalHandle.getResult();

            var attribute = {};
            attribute.name = "Status";
            attribute.type = 'Text';
            attribute.value = result.value;

            iotAgentLib.update(device.name, device.type, '', [attribute], device, function (error) {
                if (error) {
                    console.log('Something went wrong!!!');
                    console.log(error);
                } else {
                    console.log(`Received message:`);
                }
            });

            if (goalHandle.isSucceeded()) {
                this._node
                    .getLogger()
                    .info(`Goal succeeded with result: ${result.sequence}`);
                    console.log("Result:",result);
            } else {
                this._node.getLogger().info(`Goal failed with status: ${status}`);
            }

            //rclnodejs.shutdown();
        }
        else // Write
        {
            this._node.getLogger().info('Waiting for action server...');
            await this._actionClient.waitForServer();

            const goal = new GPIO.Goal();

            goal.gpio = command.value; // Write   
        
            this._node.getLogger().info('Sending goal request...');

            const goalHandle = await this._actionClient.sendGoal(goal, (feedback) =>
                this.feedbackCallback(feedback)
            );

            if (!goalHandle.isAccepted()) {
                this._node.getLogger().info('Goal rejected');
                return;
            }

            this._node.getLogger().info('Goal accepted');

            const result = await goalHandle.getResult();

            var attribute = {};
            attribute.name = "Status";
            attribute.type = 'Text';
            attribute.value = result.value;

            iotAgentLib.update(device.name, device.type, '', [attribute], device, function (error) {
                if (error) {
                    console.log('Something went wrong!!!');
                    console.log(error);
                } else {
                    console.log(`Received message:`);
                }
            });


            if (goalHandle.isSucceeded()) {
                this._node
                    .getLogger()
                    .info(`Goal succeeded with result: ${result.sequence}`);
                    console.log("Result:",result);
            } else {
                this._node.getLogger().info(`Goal failed with status: ${status}`);
            }

            //rclnodejs.shutdown();
        }
    }

    feedbackCallback(feedback) {
        this._node.getLogger().info(`Received feedback: ${feedback.sequence}`);
        console.log("Feedback:",feedback);
    }
}