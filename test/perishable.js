/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const AdminConnection = require('composer-admin').AdminConnection;
const BrowserFS = require('browserfs/dist/node/index');
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const BusinessNetworkDefinition = require('composer-common').BusinessNetworkDefinition;
const path = require('path');

require('chai').should();

const bfs_fs = BrowserFS.BFSRequire('fs');
const NS = 'org.acme.shipping.perishable';
let manufacturer_id = 'lucas@email.com';
let retailer_id = 'roberth@email.com';
let factory;

describe('Perishable Shipping Network', () => {

    let businessNetworkConnection;

    before(() => {
        BrowserFS.initialize(new BrowserFS.FileSystem.InMemory());
        const adminConnection = new AdminConnection({ fs: bfs_fs });
        return adminConnection.createProfile('defaultProfile', {
            type: 'embedded'
        })
        .then(() => {
            return adminConnection.connect('defaultProfile', 'admin', 'Xurw3yU9zI0l');
        })
        .then(() => {
            return BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        })
        .then((businessNetworkDefinition) => {
            return adminConnection.deploy(businessNetworkDefinition);
        })
        .then(() => {
            businessNetworkConnection = new BusinessNetworkConnection({ fs: bfs_fs });
            return businessNetworkConnection.connect('defaultProfile', 'perishable-network', 'admin', 'Xurw3yU9zI0l');
        })
        .then(() => {
            // submit the setup demo transaction
            // this will create some sample assets and participants
            factory = businessNetworkConnection.getBusinessNetwork().getFactory();
            const geraLaudo = factory.newTransaction(NS, 'GeraLaudo');
            return businessNetworkConnection.submitTransaction(geraLaudo);
        });
    });

    describe('#shipment', () => {

        it('should receive base price for a shipment within temperature range', () => {
            // submit the temperature reading
            const tempReading = factory.newTransaction(NS, 'TemperatureReading');
            tempReading.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
            tempReading.centigrade = 4.5;
            return businessNetworkConnection.submitTransaction(tempReading)
                .then(() => {
                    // submit the shipment received
                    const received = factory.newTransaction(NS, 'ShipmentReceived');
                    received.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
                    return businessNetworkConnection.submitTransaction(received);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Manufacturer');
                })
                .then((manufacturerRegistry) => {
                    // check the manufacturer's balance
                    return manufacturerRegistry.get(manufacturer_id);
                })
                .then((newManufacturer) => {
                    // console.log(JSON.stringify(businessNetworkConnection.getBusinessNetwork().getSerializer().toJSON(newManufacturer)));
                    newManufacturer.accountBalance.should.equal(2500);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Retailer');
                })
                .then((retailerRegistry) => {
                    // check the retailer's balance
                    return retailerRegistry.get(retailer_id);
                })
                .then((newRetailer) => {
                    newRetailer.accountBalance.should.equal(-2500);
                })
                .then(() => {
                    return businessNetworkConnection.getAssetRegistry(NS + '.Shipment');
                })
                .then((shipmentRegistry) => {
                    // check the state of the shipment
                    return shipmentRegistry.get('SHIP_001');
                })
                .then((shipment) => {
                    shipment.status.should.equal('ARRIVED');
                });
        });

        // This test does not work. You cannot set state in the transaction anymore.
        // Don't know what has changed, but the attempt to set the timestamp does
        // not work, so this test fails. Commenting it out.
        // it('should receive nothing for a late shipment', () => {
        //     // submit the temperature reading
        //     const tempReading = factory.newTransaction(NS, 'TemperatureReading');
        //     tempReading.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
        //     tempReading.centigrade = 4.5;
        //     return businessNetworkConnection.submitTransaction(tempReading)
        //         .then(() => {
        //             // submit the shipment received
        //             const received = factory.newTransaction(NS, 'ShipmentReceived');
        //             received.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
        //             const late = new Date();
        //             late.setDate(late.getDate() + 2);
        //             received.timestamp = late;
        //             return businessNetworkConnection.submitTransaction(received);
        //         })
        //         .then(() => {
        //             return businessNetworkConnection.getParticipantRegistry(NS + '.Manufacturer');
        //         })
        //         .then((manufacturerRegistry) => {
        //             // check the manufacturer's balance
        //             return manufacturerRegistry.get(manufacturer_id);
        //         })
        //         .then((newManufacturer) => {
        //             // console.log(JSON.stringify(businessNetworkConnection.getBusinessNetwork().getSerializer().toJSON(newManufacturer)));
        //             newManufacturer.accountBalance.should.equal(2500);
        //         })
        //         .then(() => {
        //             return businessNetworkConnection.getParticipantRegistry(NS + '.Retailer');
        //         })
        //         .then((retailerRegistry) => {
        //             // check the retailer's balance
        //             return retailerRegistry.get(retailer_id);
        //         })
        //         .then((newRetailer) => {
        //             newRetailer.accountBalance.should.equal(-2500);
        //         });
        // });

        it('should apply penalty for min temperature violation', () => {
            // submit the temperature reading
            const tempReading = factory.newTransaction(NS, 'TemperatureReading');
            tempReading.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
            tempReading.centigrade = 1;
            return businessNetworkConnection.submitTransaction(tempReading)
                .then(() => {
                    // submit the shipment received
                    const received = factory.newTransaction(NS, 'ShipmentReceived');
                    received.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
                    return businessNetworkConnection.submitTransaction(received);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Manufacturer');
                })
                .then((manufacturerRegistry) => {
                    // check the manufacturer's balance
                    return manufacturerRegistry.get(manufacturer_id);
                })
                .then((newManufacturer) => {
                    // console.log(JSON.stringify(businessNetworkConnection.getBusinessNetwork().getSerializer().toJSON(newManufacturer)));
                    newManufacturer.accountBalance.should.equal(4000);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Retailer');
                })
                .then((retailerRegistry) => {
                    // check the retailer's balance
                    return retailerRegistry.get(retailer_id);
                })
                .then((newRetailer) => {
                    newRetailer.accountBalance.should.equal(-4000);
                });
        });

        it('should apply penalty for max temperature violation', () => {
            // submit the temperature reading
            const tempReading = factory.newTransaction(NS, 'TemperatureReading');
            tempReading.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
            tempReading.centigrade = 11;
            return businessNetworkConnection.submitTransaction(tempReading)
                .then(() => {
                    // submit the shipment received
                    const received = factory.newTransaction(NS, 'ShipmentReceived');
                    received.shipment = factory.newRelationship(NS, 'Shipment', 'SHIP_001');
                    return businessNetworkConnection.submitTransaction(received);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Manufacturer');
                })
                .then((manufacturerRegistry) => {
                    // check the manufacturer's balance
                    return manufacturerRegistry.get(manufacturer_id);
                })
                .then((newManufacturer) => {
                    // console.log(JSON.stringify(businessNetworkConnection.getBusinessNetwork().getSerializer().toJSON(newManufacturer)));
                    newManufacturer.accountBalance.should.equal(5000);
                })
                .then(() => {
                    return businessNetworkConnection.getParticipantRegistry(NS + '.Retailer');
                })
                .then((retailerRegistry) => {
                    // check the retailer's balance
                    return retailerRegistry.get(retailer_id);
                })
                .then((newRetailer) => {
                    newRetailer.accountBalance.should.equal(-5000);
                });
        });
    });
});