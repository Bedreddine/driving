package com.taxi;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/** Fails when one module reaches into another module's internals, or modules depend on each other in a cycle. */
class ModularityTest {

    private final ApplicationModules modules = ApplicationModules.of(TaxiApplication.class);

    @Test
    void modulesRespectTheirBoundaries() {
        modules.verify();
    }

    @Test
    void writeModuleDiagrams() {
        new Documenter(modules).writeModulesAsPlantUml().writeIndividualModulesAsPlantUml();
    }
}
