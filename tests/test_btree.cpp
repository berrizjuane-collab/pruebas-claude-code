#include "yggdrasil/core/btree.hpp"

#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using yggdrasil::BTree;
using yggdrasil::BTreeEventType;
using yggdrasil::Faction;
using yggdrasil::Operative;
using yggdrasil::Shield;
using yggdrasil::Weapon;

[[noreturn]] void fail(const std::string& message) {
    throw std::runtime_error(message);
}

void require(const bool condition, const std::string& message) {
    if (!condition) {
        fail(message);
    }
}

Operative makeOperative(const int id) {
    Operative result(
        id,
        "Operative " + std::to_string(id),
        id % 2 == 0 ? Faction::Neon : Faction::Omega,
        100 + (std::abs(id) % 50),
        (std::abs(id) % 3) + 1,
        20 + (std::abs(id) % 10),
        0,
        30 + (std::abs(id) % 20),
        id % 11 == 0);
    result.pushShield(Shield{1, "Barrera", "Personal", 150, 200, 30});
    result.enqueueWeapon(Weapon{1, "Plasma", "Directo", 180, 100, 20});
    return result;
}

std::vector<int> keys(const BTree& tree) {
    std::vector<int> result;
    for (const Operative& operative : tree.inOrder()) {
        result.push_back(operative.id);
    }
    return result;
}

void requireValid(const BTree& tree, const std::string& context) {
    const auto validation = tree.validate();
    if (!validation.valid) {
        std::ostringstream details;
        details << context << ":";
        for (const std::string& error : validation.errors) {
            details << "\n  - " << error;
        }
        fail(details.str());
    }
}

bool hasEvent(const BTree& tree, const BTreeEventType type) {
    return std::any_of(tree.events().begin(), tree.events().end(),
                       [type](const auto& event) { return event.type == type; });
}

void testCanonicalTypes() {
    Operative operative = makeOperative(42);
    require(operative.id == 42, "operative ID must be retained");
    require(operative.health == operative.baseHp, "stamped health and initial HP must agree");
    require(operative.attack == operative.strength, "strength must collapse into attack");
    require(operative.alive(), "new operative should be alive");

    operative.pushShield(Shield{2, "Deflector", "Area", 300, 100, 60});
    require(operative.activeShield() != nullptr && operative.activeShield()->id == 2,
            "shield stack must be LIFO at vector::back");
    operative.popShield();
    require(operative.activeShield() != nullptr && operative.activeShield()->id == 1,
            "popping a shield must expose the shield below it");

    operative.enqueueWeapon(Weapon{2, "Gauss", "Precision", 250, 50, 30});
    require(operative.activeWeapon() != nullptr && operative.activeWeapon()->id == 1,
            "weapon arsenal must be FIFO at deque::front");
    operative.popWeapon();
    require(operative.activeWeapon() != nullptr && operative.activeWeapon()->id == 2,
            "spending a weapon must expose the next queued weapon");
}

void testBottomUpSplitAndPrediction() {
    BTree tree;
    require(tree.insert(makeOperative(10)), "insert 10");
    const auto originalRoot = tree.rootId();
    require(originalRoot.has_value(), "first insertion must create a root");
    require(tree.insert(makeOperative(20)), "insert 20");
    require(tree.insert(makeOperative(30)), "insert 30");

    const auto prediction = tree.predictInsert(40);
    require(!prediction.duplicate, "40 is not a duplicate");
    require(prediction.destinationNodeId == originalRoot, "insertion should target the old root");
    require(prediction.splitNodeIds == std::vector<BTree::NodeId>{*originalRoot},
            "full root must be predicted to split");
    require(prediction.rootSplit && prediction.projectedHeight == 2,
            "root overflow must predict one new level");

    require(tree.insert(makeOperative(40)), "insert 40");
    requireValid(tree, "four-key root split");
    require(keys(tree) == std::vector<int>({10, 20, 30, 40}), "in-order after split");
    require(tree.height() == 2, "split root should have height two");

    const auto snapshot = tree.snapshot();
    require(snapshot.rootId.has_value(), "snapshot must identify root");
    const auto* root = snapshot.findNode(*snapshot.rootId);
    require(root != nullptr && root->keys == std::vector<int>{30},
            "overflow split must promote index 2 (key 30)");
    require(root->children.size() == 2, "new root must have two children");
    const auto* left = snapshot.findNode(root->children[0]);
    const auto* right = snapshot.findNode(root->children[1]);
    require(left != nullptr && left->id == *originalRoot && left->keys == std::vector<int>({10, 20}),
            "stable old node must retain the two left keys");
    require(right != nullptr && right->keys == std::vector<int>{40},
            "new right node must retain the one right key");
    require(hasEvent(tree, BTreeEventType::NodeSplit), "split must be observable");

    const std::size_t beforeDuplicate = tree.size();
    require(!tree.insert(makeOperative(20)), "duplicate IDs must be rejected");
    require(tree.size() == beforeDuplicate, "duplicate must not alter size");
    require(hasEvent(tree, BTreeEventType::DuplicateRejected), "duplicate rejection must be observable");
    require(tree.predictInsert(20).duplicate, "prediction must report existing key");

    const auto nodeId = tree.nodeIdFor(40);
    require(nodeId.has_value(), "node lookup by key");
    const auto node = tree.node(*nodeId);
    require(node.has_value() && node->keys == std::vector<int>{40}, "snapshot lookup by stable ID");
    require(tree.predecessor(30).has_value() && tree.predecessor(30)->id == 20,
            "predecessor for internal key");
}

void testRightBorrowHasPriority() {
    BTree tree;
    for (const int id : {10, 20, 30, 40, 50}) {
        require(tree.insert(makeOperative(id)), "right-borrow setup insert");
    }
    tree.clearEvents();
    require(tree.erase(10), "erase 10");
    require(tree.erase(20), "erase 20");
    requireValid(tree, "right borrow");
    require(hasEvent(tree, BTreeEventType::BorrowedFromRight), "underflow must borrow from right");
    require(!hasEvent(tree, BTreeEventType::BorrowedFromLeft),
            "right borrow must win when it is available");
    require(keys(tree) == std::vector<int>({30, 40, 50}), "keys after right borrow");
}

void testLeftBorrow() {
    BTree tree;
    for (const int id : {10, 20, 30, 40, 50}) {
        require(tree.insert(makeOperative(id)), "left-borrow setup insert");
    }
    tree.clearEvents();
    require(tree.erase(50), "erase 50");
    require(tree.erase(40), "erase 40");
    requireValid(tree, "left borrow");
    require(hasEvent(tree, BTreeEventType::BorrowedFromLeft), "underflow must borrow from left");
    require(keys(tree) == std::vector<int>({10, 20, 30}), "keys after left borrow");
}

void testMergeAndRootReduction() {
    BTree tree;
    for (const int id : {10, 20, 30, 40}) {
        require(tree.insert(makeOperative(id)), "merge setup insert");
    }
    const auto splitRoot = tree.rootId();
    tree.clearEvents();
    require(tree.erase(10), "erase 10");
    require(tree.erase(20), "erase 20");
    requireValid(tree, "merge plus root reduction");
    require(hasEvent(tree, BTreeEventType::NodesMerged), "unborrowable underflow must merge");
    require(hasEvent(tree, BTreeEventType::RootReduced), "empty internal root must reduce");
    require(tree.height() == 1 && tree.rootId() != splitRoot, "tree must lose one level");
    require(keys(tree) == std::vector<int>({30, 40}), "keys after merge/root reduction");

    tree.clearEvents();
    require(tree.erase(30) && tree.erase(40), "erase final keys");
    require(tree.empty() && !tree.rootId().has_value(), "erasing final key must remove leaf root");
    requireValid(tree, "empty tree after root removal");
    require(hasEvent(tree, BTreeEventType::RootReduced), "leaf-root removal must be observable");
}

void compareWithReference(const BTree& tree, const std::set<int>& reference,
                          const std::string& context) {
    requireValid(tree, context);
    require(tree.size() == reference.size(), context + ": size mismatch");
    const std::vector<int> expected(reference.begin(), reference.end());
    require(keys(tree) == expected, context + ": traversal mismatch");
    for (const int id : reference) {
        const Operative* const found = tree.find(id);
        require(found != nullptr && found->id == id, context + ": search mismatch");
    }
}

void testRandomInsertEraseSequences() {
    for (std::uint32_t seed = 1; seed <= 16; ++seed) {
        std::mt19937 random(seed);
        std::uniform_int_distribution<int> idDistribution(-120, 120);
        std::bernoulli_distribution insertDistribution(0.55);
        BTree tree;
        std::set<int> reference;

        for (int step = 0; step < 1000; ++step) {
            const int id = idDistribution(random);
            if (insertDistribution(random)) {
                const bool expected = reference.insert(id).second;
                const bool actual = tree.insert(makeOperative(id));
                require(actual == expected, "random insert result mismatch");
            } else {
                const bool expected = reference.erase(id) != 0;
                const bool actual = tree.erase(id);
                require(actual == expected, "random erase result mismatch");
            }
            compareWithReference(
                tree, reference,
                "random seed " + std::to_string(seed) + " step " + std::to_string(step));
        }

        std::vector<int> remaining(reference.begin(), reference.end());
        std::shuffle(remaining.begin(), remaining.end(), random);
        for (const int id : remaining) {
            require(tree.erase(id), "random drain erase");
            reference.erase(id);
            compareWithReference(tree, reference, "random drain seed " + std::to_string(seed));
        }
        require(tree.empty(), "randomly drained tree must be empty");

        std::uint64_t sequence = 0;
        for (const auto& event : tree.events()) {
            require(event.sequence > sequence, "structural event sequences must be monotonic");
            sequence = event.sequence;
        }
    }
}

} // namespace

int main() {
    struct TestCase {
        const char* name;
        void (*run)();
    };
    const TestCase tests[] = {
        {"canonical types", testCanonicalTypes},
        {"bottom-up split and prediction", testBottomUpSplitAndPrediction},
        {"right borrow priority", testRightBorrowHasPriority},
        {"left borrow", testLeftBorrow},
        {"merge and root reduction", testMergeAndRootReduction},
        {"random insertion/erasure invariants", testRandomInsertEraseSequences},
    };

    int failures = 0;
    for (const TestCase& test : tests) {
        try {
            test.run();
            std::cout << "[PASS] " << test.name << '\n';
        } catch (const std::exception& exception) {
            ++failures;
            std::cerr << "[FAIL] " << test.name << ": " << exception.what() << '\n';
        }
    }

    if (failures != 0) {
        std::cerr << failures << " test group(s) failed\n";
        return EXIT_FAILURE;
    }
    std::cout << "All B-tree tests passed\n";
    return EXIT_SUCCESS;
}
