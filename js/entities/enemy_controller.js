/*
 * Enemy AI controller entity
 */
game.AI = me.Renderable.extend({

    init: function (settings) {
        // call the parent constructor
        // (zero size makes this object non-renderable, so the Renderable.draw method won't get called)
        this._super(me.Renderable, 'init', [0, 0, 0, 0]);


        // Always update even if this invisible entity is "off the screen"
        this.alwaysUpdate = true;

        this.spawnPoint = settings.spawnPoint;
        this.spawnPoint.renderable.anchorPoint.set(0.5, 0.5);
        this.resources = settings.resources;
        this.resourcePointsOnMap = settings.resourcePoints;
        this.resourcePointsCaptured = 0;
        this.resourcePointsPending = 0;

        this.flag = settings.flag;
        this.playerFlag = settings.playerFlag;
        this.unitList = [];

        // Perform a computation after elapsed number of frames (~ 60 frames per second).
        // Since we don't really need to do computation every frame for high-level strategy
        // This is a parameter that can be tweaked to hopefully alter the difficulty of the AI

        if (settings.difficulty == "Easy") {
            game.sylvanlog("Easy difficulty.");

            this.processInterval = 150;
            this.resourceRate = 1;
        } else {
            game.sylvanlog("Hard difficulty.");

            this.processInterval = 30;
            this.resourceRate = 4;
        }

        // Set the timing variables
        this.processAccumulator = 0;
        this.resourceAccumulator = 0;
        this.resourceInterval = 60;


        this.resourceCapturePriorities = [8, 5, 3, 1, 1, 1];    // Priority level for capturing 1 resource point, 2 resource points, 3 resource points, 4 resource points, etc.
        this.unitQtyPriorities = [10, 9, 7, 5, 3, 1, 1, 1];     // Priority level for having 1 unit alive, 2 units alive, 3 units alive, etc.
        this.defendFlagPriority = 6;          // Priority for keeping own flag at home base guarded
        this.returnFlagPriority = 9;        // Priority for returning flag if other play captures it
        this.captureFlagPriority = 8;       // Priority to capture other flag

        // Generate a list of all possible units we can buy, so all the attributes of each unit is known by the controller
        this.availableUnits = [];
        let unitNames = me.loader.getJSON("manifest_enemy").units;
        for (let name of unitNames) {
            let unit = me.loader.getJSON(name);
            this.availableUnits.push(unit);
        }

        // Generate list of resource points on the map
        this.resourcePointList = me.game.world.getChildByName("capture_point")

    },


    // Set up the intervals to call certain functions. Most AI processing won't be done in here
    // because this function is being called 60 times/sec and that is overkill for high-level AI processing.
    update: function (dt) {
        // Dispatch timed functions
        this.processAccumulator++;
        this.resourceAccumulator++;
        if (this.processAccumulator >= this.processInterval) {
            this.processAccumulator = 0;
            this.process();
        }
        if (this.resourceAccumulator >= this.resourceInterval) {
            this.resourceAccumulator = 0;
            this.accumulate();
        }



    },


    // Purchase a unit by name, and place him at the spawn point, subtracting the cost from current resources
    buyUnit: function (name) {
        game.sylvanlog("Trying to buy", name);

        let settings = me.loader.getJSON(name);

        if (settings !== null) {
            settings.controller = this;
            settings.team = game.data.enemy;
            settings.initialState = 'spawning';

            if (this.resources >= settings.cost) {
                game.sylvanlog("Purchasing unit", name);
                var unit = me.pool.pull(name, 20, 20, settings);
                unit.pos.x = this.spawnPoint.pos.x - unit.width * 0.5;
                unit.pos.y = this.spawnPoint.pos.y - unit.height * 1.0;
                this.resources -= settings.cost;
                this.unitList.push(unit);
                unit.player = this;
                me.game.world.addChild(unit, me.game.world.getChildByName("units")[0].pos.z);
            }
        }
    },


    // Accumulate resources based on how many resource points we are in control of
    accumulate: function () {
        this.resources += this.resourceRate * (1 + this.resourcePointsCaptured);
    },


    // Receive a message from a unit so we can act on the information
    report: function (unit, message) {
        if (message == 'dead') {
            game.sylvanlog("AI Controller: Unit reporting as dead");
            this.removeUnitFromList(unit);
        }
        if (message == "returned flag") {
            game.sylvanlog("AI Controller: Unit reporting it returned the flag");

        }
        if (message == "got flag") {
            game.sylvanlog("AI Controller: Unit reporting picked up flag");
            destination = this.flag.homePosition;
            unit.command({ type: "capture flag", x: destination.x, y: destination.y + 20 });
        }

    },


    // If a unit dies, we need to remove the reference to that unit from the array
    removeUnitFromList: function (unit) {
        var pos = this.unitList.indexOf(unit);
        if (pos != -1) {
            this.unitList.splice(pos, 1);
        }
    },


    // Determine where the player's flag currently is (and note if it is at its base)
    getOtherFlagPosition: function () {
        this.playerFlagAtHome = this.playerFlag.pos.equals(this.playerFlag.homePosition);

    },


    // Determine where my flag currently is (and note if it is at my base)
    getMyFlagPosition: function () {
        //this.flagAtHome = this.flag.pos.equals(this.flagHomePosition);

    },


    // AI does processing in here
    process: function () {
        game.sylvanlog("AI processing function");

        // Generate priorities object
        let priorities = {
            acquireResource: this.resourceCapturePriorities[this.resourcePointsPending],
            acquireUnit: this.unitQtyPriorities[this.unitList.length],
            guardFlag: this.flag.isHome() ? this.defendFlagPriority : 0,
            returnFlag: this.flag.isHome() ? 0 : this.returnFlagPriority,
            captureFlag: this.captureFlagPriority
        };

        let highestPriority = this.getHighestPriority(priorities);

        
        game.sylvanlog("Enemy controller priorities:", priorities);
        game.sylvanlog("Highest priority:", highestPriority, priorities[highestPriority]);
        
/*
        if (highestPriority == "acquireUnit") {
            // For general unit purchases not tied to a specific goal, I will prioritize speed because fast units can
            // capture resource points faster, and can capture the flag or return flag faster than others
            let nameOfUnit = this.getFastestUnitICanAfford();
            if (nameOfUnit == "") {
                game.sylvanlog("Enemy controller: cannot afford any unit at this time. Resources:", this.resources);
            } else {
                this.buyUnit(nameOfUnit);
                // What should we have the new unit do?
                let actionPriority = this.getUnitActionPriority(priorities);
                let unit = this.unitList[this.unitList.length - 1];
                var destination;
                switch (actionPriority) {
                    case "acquireResource":
                        resourcePoint = this.getNearestUncapturedResource(unit);
                    
                        game.sylvanlog("Destination: ", resourcePoint.pos.toString());
                        // order the unit to move to the resource point and capture it
                        game.sylvanlog("Enemy controller: commanding newly purchased unit to acquire resource");
                        
                        unit.command({ type: "capture resource", point: resourcePoint })
                        break;
                    case "guardFlag":
                        game.sylvanlog("Enemy controller: commanding newly purchased unit to guard the flag");
                        break;
                    case "returnFlag":
                        game.sylvanlog("Enemy controller: commanding newly purchased unit to return the flag");
                        break;
                    case "captureFlag":
                        game.sylvanlog("Enemy controller: commanding newly purchased unit to capture the flag");
                        
                        destination = this.playerFlag.pos;
                        unit.command({ type: "capture flag", x: destination.x, y: destination.y + 20 });
                        break;
                    default:
                        // Take no action for now
                        break;
                }
            }

        } */

        // Trying new tactic

        // I want at least one flag defender at all times

        if (this.unitList.length < 1) {
            let nameOfUnit = this.getFastestUnitICanAfford();
            if (nameOfUnit == "") {
                game.sylvanlog("Enemy controller: cannot afford any unit at this time. Resources:", this.resources);
            } else {
                this.buyUnit(nameOfUnit);
            }
        } else {
            // I have met the minimum requirement, now I should consider saving for a better unit next

        }

        if (this.unitList.length == 0) {
            return;     // Can't do anything this turn until I get some more resources
        }

        // What action do I want to take?

    },



    getHighestPriority: function (priorities) {
        var highestP = "";
        var highVal = 0;
        for (let p in priorities) {
            if (priorities[p] > highVal) {
                highVal = priorities[p];
                highestP = p;
            } else if (priorities[p] == highVal) {
                // need a tie breaker.
                if (Math.floor(Math.random() * 2) == 0) {
                    highVal = priorities[p];
                    highestP = p;
                }
            } else {
                // Do nothing
            }
        }

        return highestP;
    },


    getUnitActionPriority: function (priorities) {
        var highestP = "";
        var highVal = 0;
        for (let p in priorities) {
            if (p == "acquireUnit") {
                continue;
            }
            if (priorities[p] > highVal) {
                highVal = priorities[p];
                highestP = p;
            } else if (priorities[p] == highVal) {
                // need a tie breaker.
                if (Math.floor(Math.random() * 2) == 0) {
                    highVal = priorities[p];
                    highestP = p;
                }
            } else {
                // Do nothing
            }
        }

        return highestP;
    },


    // Unit with highest speed attribute whose cost is less than or equal to my current resource count
    getFastestUnitICanAfford: function () {
        var fastest = "";
        var highSpeed = 0;
        var highAtt = 0;
        var highDef = 0;
        var loCost = 0;
        for (let unit of this.availableUnits) {
            if (unit.cost > this.resources) {
                continue;
            }

            if (unit.speed > highSpeed) {
                fastest = unit.name;
                highSpeed = unit.speed;
                highAtt = unit.attack;
                highDef = unit.defense;
                loCost = unit.cost;
            } else if (unit.speed == highSpeed) {
                // need a tie breaker
                if (unit.attack == highAtt) {
                    // need another tie breaker
                    if (unit.defense == highDef) {
                        // All attributes are the same, go with the cheaper one
                        if (unit.cost < loCost) {
                            // The new unit wins
                            fastest = unit.name;
                            highSpeed = unit.speed;
                            highAtt = unit.attack;
                            highDef = unit.defense;
                            loCost = unit.cost;
                        } else {
                            // Stick with existing fastest unit
                        }
                    }
                    if (unit.defense > highDef) {
                        // The new unit wins
                        fastest = unit.name;
                        highSpeed = unit.speed;
                        highAtt = unit.attack;
                        highDef = unit.defense;
                        loCost = unit.cost;
                    }
                }

                if (unit.attack > highAtt) {
                    // The new unit wins
                    fastest = unit.name;
                    highSpeed = unit.speed;
                    highAtt = unit.attack;
                    highDef = unit.defense;
                    loCost = unit.cost;
                }

            }
        }

        return fastest;
    },


    // Unit with highest attack attribute whose cost is less than or equal to my current resource count
    getStrongestUnitICanAfford: function () {

    },


    // Unit with highest defense attribute whose cost is less than or equal to my current resource count
    getToughestUnitICanAfford: function () {

    },


    // Get the nearest resource point that hasn't been captured yet
    getNearestUncapturedResource: function (unit) {
        if (unit == null) {
            return;
        }
        
        game.sylvanlog(unit);
        let resourceList = me.game.world.getChildByName("capture_point");
        var index = -1;
        var dist = 100000;
        var destPoint = null;
        for (var i = 0; i < resourceList.length; i++) {
            let point = resourceList[i];
            if (point.owner != null) {
                continue;
            }
            // Check other units to see if they've been ordered to capture the same resource point
            var alreadyOrdered = false;
            for (let eachUnit of this.unitList) {
                let orderPoint = eachUnit.currentOrders.point;
                if (orderPoint != null && orderPoint == point) {
                    alreadyOrdered = true;
                }
            }
            if (alreadyOrdered) {
                continue;
            }
            let thisDist = unit.pos.distance(point.pos);
            if (thisDist < dist) {
                dist = thisDist;
                index = i;
            }
        }

        
        var destPoint = null;
        if (index != -1) {
            destPoint = resourceList[index];
            game.sylvanlog("nearest uncaptured resource:", destPoint.pos.toString());
            
        }

        return destPoint;

    },










});